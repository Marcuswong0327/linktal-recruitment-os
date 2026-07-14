import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

// How to turn an entityType + id into a human label: which Prisma delegate to
// read, and which fields to join (displayId first, then a name). Bulk entries
// and types not listed here just show their raw id.
const ENTITY_LABEL: Record<string, { delegate: string; fields: string[] }> = {
  Candidate: { delegate: 'candidate', fields: ['displayId', 'fullName'] },
  Client: { delegate: 'client', fields: ['displayId', 'companyName'] },
  Stakeholder: { delegate: 'stakeholder', fields: ['displayId', 'fullName'] },
  JobOrder: { delegate: 'jobOrder', fields: ['displayId', 'jobTitle'] },
  ClientJobResearch: { delegate: 'clientJobResearch', fields: ['jobTitle'] },
  Placement: { delegate: 'placement', fields: ['displayId'] },
  Consultant: { delegate: 'consultant', fields: ['displayId', 'fullName'] },
  Role: { delegate: 'role', fields: ['name'] },
  Permission: { delegate: 'permission', fields: ['resource', 'action'] },
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

    const [rows, total] = await this.prisma.$transaction([
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

    // Resolve each entity to a human label ("CDD-0042 · Jane Doe"), grouped by
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
}
