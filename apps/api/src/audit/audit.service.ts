import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

// How to turn an entityType + id into a human label: which Prisma delegate to
// read, and which fields to join (displayId first, then a name). Bulk entries
// and types not listed here just show their raw id.
const ENTITY_LABEL: Record<string, { delegate: string; fields: string[] }> = {
  Candidate: { delegate: 'candidate', fields: ['displayId', 'firstName', 'lastName'] },
  Client: { delegate: 'client', fields: ['displayId', 'companyName'] },
  Stakeholder: { delegate: 'stakeholder', fields: ['displayId', 'firstName', 'lastName'] },
  // jobTitle is a relation now, not a scalar — selecting it here would return
  // an object rather than a label, so these fall back to their displayId.
  JobOrder: { delegate: 'jobOrder', fields: ['displayId'] },
  ClientJobResearch: { delegate: 'clientJobResearch', fields: ['displayId'] },
  Placement: { delegate: 'placement', fields: ['displayId'] },
  Consultant: { delegate: 'consultant', fields: ['displayId', 'fullName'] },
  Role: { delegate: 'role', fields: ['name'] },
  Permission: { delegate: 'permission', fields: ['resource', 'action'] },
  Tob: { delegate: 'tob', fields: ['fileName'] },
};

type LabelDelegate = {
  findMany: (args: {
    where: { id: { in: string[] } };
    select: Record<string, boolean>;
  }) => Promise<Array<Record<string, unknown>>>;
};

@Injectable()
export class AuditService {
  // The base client: AuditLog is neither soft-deleted nor audited, so there's
  // no need for the extended client here (and it avoids self-referential reads).
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAuditLogsDto) {
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

    // Resolve actor ids → names in one lookup (actorId is a plain column, no FK).
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await this.prisma.consultant.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(actors.map((a) => [a.id, a.fullName]));

    // Resolve each entity to a human label ("CDD-000042 · Jane Doe"), grouped by
    // type so it's one query per type. Uses the base client, so soft-deleted
    // rows still resolve; hard-purged rows won't be found → label stays null.
    const idsByType = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!ENTITY_LABEL[r.entityType]) continue;
      (idsByType.get(r.entityType) ?? idsByType.set(r.entityType, new Set()).get(r.entityType)!).add(
        r.entityId,
      );
    }
    const labelByKey = new Map<string, string>();
    for (const [type, ids] of idsByType) {
      const { delegate, fields } = ENTITY_LABEL[type];
      const select = Object.fromEntries([['id', true], ...fields.map((f) => [f, true])]);
      const found = await (this.prisma as unknown as Record<string, LabelDelegate>)[
        delegate
      ].findMany({ where: { id: { in: [...ids] } }, select });
      for (const row of found) {
        const label = fields
          .map((f) => row[f])
          .filter((v) => v != null && v !== '')
          .join(' · ');
        if (label) labelByKey.set(`${type}:${row.id as string}`, label);
      }
    }

    const data = rows.map((r) => ({
      ...r,
      actorName: r.actorId ? (nameById.get(r.actorId) ?? null) : null,
      entityLabel: labelByKey.get(`${r.entityType}:${r.entityId}`) ?? null,
    }));

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
