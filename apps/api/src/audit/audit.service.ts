import { Injectable } from '@nestjs/common';
import { Prisma, AuditLog as RawAuditLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { ExportAuditLogsDto } from './dto/export-audit-logs.dto';
import { collectRefs, presentRow, PresentedRow } from './audit-presenter';
import { entityTypeLabel } from './audit-schema.map';
import { AUDITED_MODELS } from '../prisma/prisma.extensions';
import { LabelRequest, LabelResolverService } from './label-resolver.service';
import { logExport } from '../common/audit-export';
import { buildWorkbook, ExportColumn, resolveTimeZone } from '../common/xlsx-export';
import { ResolvedChange } from './entities/resolved-change.entity';

// Mirrors the frontend's auditActionLabels (apps/web/src/features/audit/schema.ts) — kept in
// sync by hand since the two apps don't share code, but both read the same AuditAction enum.
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  SOFT_DELETE: 'Archived',
  RESTORE: 'Restored',
  DEACTIVATE: 'Deactivated',
  HARD_DELETE: 'Deleted',
  EXPORT: 'Exported',
};

const SUMMARY_FIELD_CAP = 6;

/** A resolved value as a plain string — the export's equivalent of the frontend's displayValue. */
function displayValue(v: ResolvedChange['to']): string {
  if (v.redacted) return 'hidden';
  if (v.label == null && (v.raw == null || v.raw === '')) return 'empty';
  const base = v.label ?? String(v.raw);
  return v.deleted ? `${base} (archived)` : base;
}

function hasPreviousValue(v: ResolvedChange['to']): boolean {
  return v.redacted === true || v.raw != null || v.label != null;
}

/** One-line "Field: old → new" summary for the export's Changes column — same shape as the frontend's summarizeResolvedChanges, just uncapped-ish (a wider cap since a spreadsheet cell isn't a truncated table row). */
function summarizeChanges(rows: ResolvedChange[] | null): string {
  if (!rows || rows.length === 0) return '';
  const parts = rows.slice(0, SUMMARY_FIELD_CAP).map((r) => {
    const to = displayValue(r.to);
    return hasPreviousValue(r.from) ? `${r.fieldLabel}: ${displayValue(r.from)} → ${to}` : `${r.fieldLabel}: ${to}`;
  });
  const extra = rows.length > SUMMARY_FIELD_CAP ? `, +${rows.length - SUMMARY_FIELD_CAP} more` : '';
  return parts.join('; ') + extra;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function requestIdOf(metadata: unknown): string | undefined {
  if (metadata == null || typeof metadata !== 'object') return undefined;
  const id = (metadata as Record<string, unknown>).requestId;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Whether a requestId can be trusted to identify one action.
 *
 * The e2e suite writes the literal string 'e2e-test' as its requestId, so
 * every row any test run ever produced shares one value — grouping on it would
 * merge unrelated actions into one enormous fictitious "action".
 */
const NON_UNIQUE_REQUEST_IDS = new Set(['e2e-test']);

export function isGroupableRequestId(id: string | undefined): id is string {
  return typeof id === 'string' && id !== '' && !NON_UNIQUE_REQUEST_IDS.has(id);
}

/**
 * An upper bound given as a bare calendar date means "up to the end of that
 * day", not "up to midnight at the start of it" — `lte: new Date('2026-08-26')`
 * is `2026-08-26T00:00:00Z`, which silently excludes every entry made on the
 * day the user actually asked for. The web client sends a full instant (its
 * own local end-of-day, so the boundary lands where the reader expects it);
 * this covers any other caller that passes a plain date.
 */
function endOfDayIfDateOnly(value: string): Date {
  return DATE_ONLY.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
}

/** Date + time (unlike xlsx-export's own formatExportDate, which is date-only) — an activity log routinely has several entries on the same day, so the export needs the same precision the grid shows. */
function formatWhen(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

@Injectable()
export class AuditService {
  // The base client: AuditLog is neither soft-deleted nor audited, so there's
  // no need for the extended client here (and it avoids self-referential reads).
  constructor(
    private readonly prisma: PrismaService,
    private readonly labelResolver: LabelResolverService,
  ) {}

  /** Shared by `findAll` and `exportAll` so the exported sheet mirrors the grid's current filters exactly. */
  private buildWhere(
    query: Pick<QueryAuditLogsDto, 'action' | 'entityType' | 'actorId' | 'requestId' | 'from' | 'to'>,
  ): Prisma.AuditLogWhereInput {
    const { action, entityType, actorId, requestId, from, to } = query;
    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (actorId) where.actorId = actorId;
    if (requestId) where.metadata = { path: ['requestId'], equals: requestId };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: endOfDayIfDateOnly(to) } : {}),
      };
    }
    return where;
  }

  /**
   * Every value the "Record type" filter should offer: the models the audit
   * extension intercepts, plus every type that has actually landed in the
   * table. The second half matters because EXPORT rows are written by hand
   * (`common/audit-export.ts`) for whatever entity was exported, so types like
   * EmailTemplate appear in the log without ever being in `AUDITED_MODELS`.
   */
  async entityTypes(): Promise<{ value: string; label: string }[]> {
    const seen = await this.prisma.auditLog.groupBy({ by: ['entityType'] });
    const values = new Set<string>([...AUDITED_MODELS, ...seen.map((r) => r.entityType)]);
    return [...values]
      .map((value) => ({ value, label: entityTypeLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Per-action totals under the same filters the grid is showing — one
   * GROUP BY, deliberately sharing `buildWhere` with `findAll` so the
   * breakdown can never describe a different result set than the rows below
   * it.
   */
  async actionCounts(
    query: Pick<QueryAuditLogsDto, 'action' | 'entityType' | 'actorId' | 'from' | 'to'>,
  ): Promise<{ action: string; count: number }[]> {
    // `action` is excluded from its own breakdown: with it applied, every
    // other action would read zero and the strip would stop being a way to
    // move between them.
    const where = this.buildWhere({ ...query, action: undefined });
    const grouped = await this.prisma.auditLog.groupBy({ by: ['action'], where, _count: { _all: true } });
    return grouped.map((g) => ({ action: g.action, count: g._count._all }));
  }

  /**
   * How many entries each of these requests wrote in total.
   *
   * One grouped pass rather than a query per row. Raw SQL because Prisma's
   * `groupBy` can't group on a JSON path, and the alternative — one
   * `metadata: { path, equals }` filter per distinct request — is a separate
   * scan each. Worth an index on `(metadata->>'requestId')` if this table
   * ever grows past a few tens of thousands of rows.
   */
  private async countByRequest(requestIds: string[]): Promise<Map<string, number>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ rid: string; n: number }[]>`
      SELECT metadata->>'requestId' AS rid, COUNT(*)::int AS n
      FROM "AuditLog"
      WHERE metadata->>'requestId' = ANY(${requestIds})
      GROUP BY 1
    `;
    return new Map(rows.map((r) => [r.rid, r.n]));
  }

  /** One shared label-resolution + presentation pass — used by `findAll` and both export paths. */
  private async present(rows: RawAuditLog[], isAdmin: boolean): Promise<(RawAuditLog & PresentedRow)[]> {
    // One shared request across the whole set — every row's own
    // entityType/entityId, actorId, and every foreign-key-shaped value found
    // inside `changes`/`metadata.where` — resolved in one parallel wave (one
    // query per distinct *target model*, not per row or per field). This
    // replaces what used to be a separate actor lookup plus a sequential
    // per-entity-type loop (see LabelResolverService's doc).
    const request: LabelRequest = new Map();
    collectRefs(rows, request);
    const labels = await this.labelResolver.resolve(request);
    return rows.map((r) => ({ ...r, ...presentRow(r, labels, isAdmin) }));
  }

  async findAll(query: QueryAuditLogsDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder } = query;
    const where = this.buildWhere(query);
    const orderBy: Prisma.AuditLogOrderByWithRelationInput = { [sortBy ?? 'createdAt']: sortOrder };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const presented = await this.present(rows, user.roleName === 'admin');

    // "Part of a larger action": a placement, an outreach send or a cascading
    // archive each write several entries from one request, and without this
    // they read as unrelated rows that happen to share a timestamp.
    const requestIds = [...new Set(presented.map((r) => requestIdOf(r.metadata)).filter(isGroupableRequestId))];
    const totals = await this.countByRequest(requestIds);
    const data = presented.map((r) => {
      const requestId = requestIdOf(r.metadata);
      const groupable = isGroupableRequestId(requestId);
      return {
        ...r,
        requestId: groupable ? requestId : null,
        relatedCount: groupable ? Math.max(0, (totals.get(requestId) ?? 1) - 1) : 0,
      };
    });

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  /** Every row matching the current filters, unbounded — no `skip`/`take`. */
  async exportAll(query: ExportAuditLogsDto, user: AuthUser): Promise<Buffer> {
    const where = this.buildWhere(query);
    const orderBy: Prisma.AuditLogOrderByWithRelationInput = { [query.sortBy ?? 'createdAt']: query.sortOrder };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy });
    const data = await this.present(rows, user.roleName === 'admin');
    const { timezone: _timezone, ...filters } = query;
    await logExport(this.prisma, 'AuditLog', { count: data.length, filters });
    return this.buildExportWorkbook(data, query.timezone);
  }

  /** An explicit row selection, in whatever order the caller passed the ids. */
  async exportByIds(ids: string[], user: AuthUser, timezone?: string): Promise<Buffer> {
    const rows = await this.prisma.auditLog.findMany({ where: { id: { in: ids } } });
    const data = await this.present(rows, user.roleName === 'admin');
    await logExport(this.prisma, 'AuditLog', { count: data.length, requestedIds: ids });
    return this.buildExportWorkbook(data, timezone);
  }

  private buildExportWorkbook(rows: (RawAuditLog & PresentedRow)[], timezone?: string): Promise<Buffer> {
    const tz = resolveTimeZone(timezone);
    const columns: ExportColumn[] = [
      { header: 'When', key: 'when' },
      { header: 'Actor', key: 'actor' },
      { header: 'Action', key: 'action' },
      { header: 'Record Type', key: 'recordType' },
      { header: 'Record', key: 'record' },
      { header: 'Changes', key: 'changes', wrap: true },
    ];
    const exportRows = rows.map((r) => ({
      when: formatWhen(r.createdAt, tz),
      actor: r.actorName ?? 'The system',
      action: ACTION_LABELS[r.action] ?? r.action,
      recordType: r.entityTypeLabel,
      record: r.entityLabel ?? `A ${r.entityTypeLabel.toLowerCase()} record`,
      changes: summarizeChanges(r.resolvedChanges),
    }));
    return buildWorkbook('Activity Log', columns, exportRows);
  }

  /**
   * Reshapes CandidateSubmission's generic audit trail into a friendly
   * pipeline-stage timeline — no separate write-side table, since
   * CandidateSubmission is already an audited model and every status change
   * already lands in AuditLog as a `{status: {from, to}}` diff. Scope by
   * `candidateId` (that candidate's journey across every job order) or
   * `jobOrderId` (everyone's journey through that one job order), or both.
   */
  async getPipelineTimeline(params: { candidateId?: string; jobOrderId?: string }) {
    const submissions = await this.prisma.candidateSubmission.findMany({
      where: {
        ...(params.candidateId ? { candidateId: params.candidateId } : {}),
        ...(params.jobOrderId ? { jobOrderId: params.jobOrderId } : {}),
      },
      select: { id: true, candidateId: true, jobOrderId: true },
    });
    if (submissions.length === 0) return [];
    const submissionById = new Map(submissions.map((s) => [s.id, s]));

    const logs = await this.prisma.auditLog.findMany({
      where: { entityType: 'CandidateSubmission', entityId: { in: [...submissionById.keys()] } },
      orderBy: { createdAt: 'asc' },
    });

    // Resolve actor + candidate + job order names in one lookup each,
    // mirroring findAll's label-resolution approach above.
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id))];
    const candidateIds = [...new Set(submissions.map((s) => s.candidateId))];
    const jobOrderIds = [...new Set(submissions.map((s) => s.jobOrderId))];
    const actors = actorIds.length
      ? await this.prisma.consultant.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const [candidates, jobOrders] = await Promise.all([
      this.prisma.candidate.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      // jobTitle is a JobTitle relation now — include it to get the name back.
      this.prisma.jobOrder.findMany({
        where: { id: { in: jobOrderIds } },
        select: { id: true, displayId: true, jobTitle: { select: { name: true } } },
      }),
    ]);
    const actorNameById = new Map(actors.map((a) => [a.id, a.fullName]));
    const candidateNameById = new Map(
      candidates.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(' ') || c.id]),
    );
    const jobOrderTitleById = new Map(jobOrders.map((j) => [j.id, j.jobTitle?.name ?? j.displayId]));

    const events = logs.map((log) => {
      const submission = submissionById.get(log.entityId);
      if (!submission) return null;

      let kind: 'SUBMITTED' | 'STAGE_CHANGE' | 'REMOVED' | 'RESTORED';
      let previousStage: string | null = null;
      let newStage: string | null = null;

      if (log.action === 'CREATE') {
        kind = 'SUBMITTED';
        const created = log.changes as Record<string, unknown> | null;
        newStage = (created?.status as string) ?? null;
      } else if (log.action === 'SOFT_DELETE') {
        kind = 'REMOVED';
      } else if (log.action === 'RESTORE') {
        kind = 'RESTORED';
      } else {
        const diff = log.changes as Record<string, { from: unknown; to: unknown }> | null;
        if (!diff?.status) return null; // an update that didn't touch status isn't a pipeline event
        kind = 'STAGE_CHANGE';
        previousStage = (diff.status.from as string) ?? null;
        newStage = (diff.status.to as string) ?? null;
      }

      return {
        submissionId: submission.id,
        candidateId: submission.candidateId,
        candidateName: candidateNameById.get(submission.candidateId) ?? null,
        jobOrderId: submission.jobOrderId,
        jobOrderTitle: jobOrderTitleById.get(submission.jobOrderId) ?? null,
        kind,
        previousStage,
        newStage,
        actorId: log.actorId,
        actorName: log.actorId ? (actorNameById.get(log.actorId) ?? null) : null,
        occurredAt: log.createdAt,
      };
    });

    return events.filter((e): e is NonNullable<typeof e> => e !== null);
  }
}
