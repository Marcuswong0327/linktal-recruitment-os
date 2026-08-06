import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { collectRefs, presentRow } from './audit-presenter';
import { LabelRequest, LabelResolverService } from './label-resolver.service';

@Injectable()
export class AuditService {
  // The base client: AuditLog is neither soft-deleted nor audited, so there's
  // no need for the extended client here (and it avoids self-referential reads).
  constructor(
    private readonly prisma: PrismaService,
    private readonly labelResolver: LabelResolverService,
  ) {}

  async findAll(query: QueryAuditLogsDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder, action, entityType, actorId, from, to } = query;

    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (actorId) where.actorId = actorId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

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

    // One shared request across the whole page — every row's own
    // entityType/entityId, actorId, and every foreign-key-shaped value found
    // inside `changes`/`metadata.where` — resolved in one parallel wave (one
    // query per distinct *target model*, not per row or per field). This
    // replaces what used to be a separate actor lookup plus a sequential
    // per-entity-type loop (see LabelResolverService's doc).
    const request: LabelRequest = new Map();
    collectRefs(rows, request);
    const labels = await this.labelResolver.resolve(request);

    const isAdmin = user.roleName === 'admin';
    const data = rows.map((r) => ({ ...r, ...presentRow(r, labels, isAdmin) }));

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
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
