import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { assertInJobScope, industryScopeViaClient } from '../common/industry-scope';
import { AuthUser } from '../auth/auth.types';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { UpdateStakeholderDto } from './dto/update-stakeholder.dto';
import { QueryStakeholdersDto } from './dto/query-stakeholders.dto';
import { CreateStakeholderContactHistoryDto } from './dto/create-stakeholder-contact-history.dto';
import { classifyJobTitle } from './role-type-classifier';

// roleType/client are FK relations — every read needs this to get the
// resolved name back (ClientEntity/StakeholderEntity document them as plain
// `string | null`, not the nested `{id, name, ...}` object Prisma would
// otherwise hand back). lastContactedAt is a plain scalar column (see
// schema.prisma) — Prisma's relation-aggregate `orderBy` only supports
// `_count` (not `_max`) on to-many relations, so it's denormalized rather
// than computed live, same as Client.lastContactedAt. The rest of the
// "latest contact" detail (type/notes/who) isn't sorted or filtered on, so
// it's resolved live via the top-1 contact history row instead of also
// being denormalized — display-only, cheap per row.
const STAKEHOLDER_INCLUDE = {
  // industryId is fetched alongside companyName purely for the job-scope
  // check below (Stakeholder has no industry of its own) — stripped back out
  // in `toEntity`, never part of the API response.
  client: { select: { companyName: true, industryId: true } },
  roleType: { select: { name: true } },
  contactHistory: {
    orderBy: { contactedAt: 'desc' },
    take: 1,
    select: { contactType: true, notes: true, contactedBy: { select: { fullName: true } } },
  },
} satisfies Prisma.StakeholderInclude;

type StakeholderWithRelations = {
  client: { companyName: string; industryId: string | null } | null;
  roleType: { name: string } | null;
  contactHistory: { contactType: string; notes: string | null; contactedBy: { fullName: string } | null }[];
};

function toEntity<T extends StakeholderWithRelations>(stakeholder: T) {
  const { client, roleType, contactHistory, ...rest } = stakeholder;
  const latest = contactHistory[0];
  return {
    ...rest,
    companyName: client?.companyName ?? null,
    roleType: roleType?.name ?? null,
    lastContactType: latest?.contactType ?? null,
    lastContactNotes: latest?.notes ?? null,
    lastContactedBy: latest?.contactedBy?.fullName ?? null,
  };
}

@Injectable()
export class StakeholdersService {
  constructor(
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client for the role-type catalog upsert — a
    // reference-table write, same as Industry/Specialization, doesn't need
    // the soft-delete/audit wrapper.
    private readonly base: PrismaService,
  ) {}

  /**
   * Looks up (or creates) the catalog row for a keyword-classified jobTitle.
   * Only called when the caller doesn't explicitly set `roleTypeId` — an
   * explicit value (including `null`, to clear it) always wins.
   */
  private async classifyRoleTypeId(jobTitle: string | null | undefined): Promise<string> {
    const name = classifyJobTitle(jobTitle);
    const roleType = await this.base.stakeholderRoleType.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    return roleType.id;
  }

  async findAll(query: QueryStakeholdersDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.StakeholderWhereInput = {};

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.clientIds && query.clientIds.length > 0) {
      where.clientId = { in: query.clientIds };
    }

    if (query.jobTitle) {
      where.jobTitle = { contains: query.jobTitle, mode: Prisma.QueryMode.insensitive };
    }

    if (query.roleTypeIds && query.roleTypeIds.length > 0) {
      where.roleTypeId = { in: query.roleTypeIds };
    }

    if (query.isDecisionMaker != null) {
      where.isDecisionMaker = query.isDecisionMaker;
    }

    // Built as an AND-ed list rather than a second top-level `where.OR` —
    // the free-text search below needs its own `OR`, which a plain
    // assignment would otherwise clobber instead of combining with.
    const and: Prisma.StakeholderWhereInput[] = [];

    if (q) {
      and.push({
        OR: [
          { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { mobile: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (user.roleName === 'consultant') {
      and.push(industryScopeViaClient(user.industryIds));
    }

    if (and.length > 0) {
      where.AND = and;
    }

    // lastContactedAt is null for stakeholders with no contact history yet —
    // "nulls: last" keeps those at the bottom regardless of sort direction
    // (mirrors Client.lastContactedAt's ordering).
    const orderBy: Prisma.StakeholderOrderByWithRelationInput =
      sortBy === 'lastContactedAt'
        ? { lastContactedAt: { sort: sortOrder, nulls: 'last' } }
        : sortBy
          ? { [sortBy]: sortOrder }
          : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.stakeholder.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: STAKEHOLDER_INCLUDE,
      }),
      this.prisma.stakeholder.count({ where }),
    ]);

    return { data: data.map(toEntity), total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string, user: AuthUser) {
    const stakeholder = await this.prisma.stakeholder.findUnique({
      where: { id },
      include: STAKEHOLDER_INCLUDE,
    });
    if (!stakeholder) {
      throw new NotFoundException(`Stakeholder ${id} not found`);
    }
    assertInJobScope(user, stakeholder.client?.industryId ?? null);
    return toEntity(stakeholder);
  }

  async findByDisplayId(displayId: string) {
    const stakeholder = await this.prisma.stakeholder.findUnique({
      where: { displayId },
      include: STAKEHOLDER_INCLUDE,
    });
    if (!stakeholder) {
      throw new NotFoundException(`Stakeholder ${displayId} not found`);
    }
    return toEntity(stakeholder);
  }

  async create(dto: CreateStakeholderDto) {
    const data: Prisma.StakeholderUncheckedCreateInput = { ...dto };
    if (data.roleTypeId === undefined) {
      data.roleTypeId = await this.classifyRoleTypeId(data.jobTitle);
    }
    // displayId is assigned by the DB (Stakeholder_displayId_seq default).
    const stakeholder = await this.prisma.stakeholder.create({
      data,
      include: STAKEHOLDER_INCLUDE,
    });
    return toEntity(stakeholder);
  }

  async update(id: string, dto: UpdateStakeholderDto, user: AuthUser) {
    await this.findOne(id, user);
    const data: Prisma.StakeholderUncheckedUpdateInput = { ...dto };
    // Re-classify only when jobTitle is actually changing and the caller
    // didn't also explicitly set roleTypeId in the same request.
    if (data.roleTypeId === undefined && dto.jobTitle !== undefined) {
      data.roleTypeId = await this.classifyRoleTypeId(dto.jobTitle);
    }
    const stakeholder = await this.prisma.stakeholder.update({
      where: { id },
      data,
      include: STAKEHOLDER_INCLUDE,
    });
    return toEntity(stakeholder);
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.stakeholder.delete({ where: { id } });
  }

  /**
   * Logs a contact and bumps the denormalized lastContactedAt on both the
   * stakeholder and its client — but only if this contact is newer than
   * what's already stored. A consultant backdating a contact (logging a call
   * from last week) shouldn't clobber a more recent one someone else already
   * logged. contactedById always comes from the caller's own session (never
   * the request body) — a contact can only ever be attributed to whoever is
   * actually submitting it.
   */
  async addContactHistory(id: string, dto: CreateStakeholderContactHistoryDto, consultantId: string) {
    const stakeholder = await this.base.stakeholder.findUnique({
      where: { id },
      select: { clientId: true, lastContactedAt: true },
    });
    if (!stakeholder) {
      throw new NotFoundException(`Stakeholder ${id} not found`);
    }
    const contactedAt = dto.contactedAt ? new Date(dto.contactedAt) : new Date();

    const created = await this.prisma.stakeholderContactHistory.create({
      data: {
        stakeholderId: id,
        contactType: dto.contactType,
        notes: dto.notes,
        contactedAt,
        contactedById: consultantId,
      },
    });

    if (!stakeholder.lastContactedAt || contactedAt > stakeholder.lastContactedAt) {
      await this.prisma.stakeholder.update({ where: { id }, data: { lastContactedAt: contactedAt } });

      const client = await this.base.client.findUnique({
        where: { id: stakeholder.clientId },
        select: { lastContactedAt: true },
      });
      if (client && (!client.lastContactedAt || contactedAt > client.lastContactedAt)) {
        await this.prisma.client.update({
          where: { id: stakeholder.clientId },
          data: { lastContactedAt: contactedAt },
        });
      }
    }

    return created;
  }
}
