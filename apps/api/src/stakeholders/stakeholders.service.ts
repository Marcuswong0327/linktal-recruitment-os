import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { assertInScope, isScoped, stakeholderScope } from '../common/scope';
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
// jobTitle (the company's words) and stakeholderRoleType (the consultant's
// classification) are both relations now — resolved to plain strings in
// `toEntity`, since StakeholderEntity documents them as `string | null` rather
// than the nested objects Prisma would otherwise return.
//
// `coverage` is the stakeholder's own territory set — display-only routing
// data now (who to call about which patch). It used to be a scope arm in its
// own right; see the `stakeholderScope` comment in common/scope.ts for why
// that changed to full inheritance from the client.
const STAKEHOLDER_INCLUDE = {
  // industryId/consultantId/locations are fetched alongside companyName
  // purely for the job-scope check below (a stakeholder has no scope fields
  // of its own — it inherits its client's entirely) — stripped back out in
  // `toEntity`, never part of the API response.
  client: {
    select: {
      companyName: true,
      industryId: true,
      consultantId: true,
      locations: { select: { location: { select: { ancestorIds: true } } } },
    },
  },
  jobTitle: { select: { name: true } },
  stakeholderRoleType: { select: { name: true } },
  coverage: { select: { locationId: true, location: { select: { name: true, ancestorIds: true } } } },
  contactHistory: {
    orderBy: { contactedAt: 'desc' },
    take: 1,
    select: {
      contactType: true,
      category: true,
      notes: true,
      contactedBy: { select: { fullName: true } },
    },
  },
} satisfies Prisma.StakeholderInclude;

type StakeholderWithRelations = {
  client: {
    companyName: string;
    industryId: string | null;
    consultantId: string | null;
    locations: { location: { ancestorIds: string[] } }[];
  } | null;
  jobTitle: { name: string } | null;
  stakeholderRoleType: { name: string } | null;
  coverage: { locationId: string; location: { name: string; ancestorIds: string[] } }[];
  contactHistory: {
    contactType: string | null;
    category: string | null;
    notes: string | null;
    contactedBy: { fullName: string } | null;
  }[];
};

function toEntity<T extends StakeholderWithRelations>(stakeholder: T) {
  const { client, jobTitle, stakeholderRoleType, coverage, contactHistory, ...rest } = stakeholder;
  const latest = contactHistory[0];
  return {
    ...rest,
    companyName: client?.companyName ?? null,
    jobTitle: jobTitle?.name ?? null,
    roleType: stakeholderRoleType?.name ?? null,
    // Ids alongside names: the names are display-only, the ids are what an
    // editable multi-select needs to preselect and diff against.
    coverage: coverage.map((c) => c.location.name),
    coverageLocationIds: coverage.map((c) => c.locationId),
    lastContactType: latest?.contactType ?? null,
    lastContactCategory: latest?.category ?? null,
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

  /**
   * The catalog title's text, for the keyword classifier above — job titles
   * arrive as ids, but classification reads words ("Finance Director" ->
   * Finance). Returns null for an unset or unknown id, which the classifier
   * treats as "Other".
   */
  private async jobTitleName(jobTitleId: string | null | undefined): Promise<string | null> {
    if (!jobTitleId) return null;
    const row = await this.base.jobTitle.findUnique({
      where: { id: jobTitleId },
      select: { name: true },
    });
    return row?.name ?? null;
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
      // jobTitle is a relation now — filter on the joined name.
      where.jobTitle = { name: { contains: query.jobTitle, mode: Prisma.QueryMode.insensitive } };
    }

    if (query.roleTypeIds && query.roleTypeIds.length > 0) {
      where.stakeholderRoleTypeId = { in: query.roleTypeIds };
    }

    if (query.jobTitleIds && query.jobTitleIds.length > 0) {
      where.jobTitleId = { in: query.jobTitleIds };
    }

    // Built as an AND-ed list rather than a second top-level `where.OR` —
    // the free-text search below needs its own `OR`, which a plain
    // assignment would otherwise clobber instead of combining with.
    const and: Prisma.StakeholderWhereInput[] = [];

    if (q) {
      and.push({
        OR: [
          { firstName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { lastName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { mobile: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (isScoped(user)) {
      and.push(stakeholderScope(user));
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
    // Inherited entirely from the client — its industry, its own locations,
    // and its ownership. The stakeholder's own `coverage` no longer matters.
    assertInScope(user, {
      industryId: stakeholder.client?.industryId ?? null,
      locationAncestorIds: stakeholder.client?.locations.flatMap((l) => l.location.ancestorIds) ?? [],
      consultantId: stakeholder.client?.consultantId ?? null,
    });
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

  /**
   * Would the client this stakeholder belongs to be visible to its author?
   * Now that a stakeholder's visibility is entirely inherited from its client
   * (see `stakeholderScope`), that's the whole check — `coverage` has no
   * bearing on it, only on where the contact is described as working.
   *
   * Without this, create had no scope check at all: a consultant could attach
   * a contact to any company in the system, and the row would vanish from
   * their own list the moment it was written.
   */
  private async assertResultInScope(clientId: string, user: AuthUser): Promise<void> {
    if (!isScoped(user)) return;
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        industryId: true,
        consultantId: true,
        locations: { select: { location: { select: { ancestorIds: true } } } },
      },
    });
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    assertInScope(user, {
      industryId: client.industryId,
      locationAncestorIds: client.locations.flatMap((l) => l.location.ancestorIds),
      consultantId: client.consultantId,
    });
  }

  async create(dto: CreateStakeholderDto, user: AuthUser) {
    await this.assertResultInScope(dto.clientId, user);
    const { coverageLocationIds, roleTypeId, ...scalars } = dto;
    const data: Prisma.StakeholderUncheckedCreateInput = { ...scalars };
    // An explicit role type always wins; otherwise derive one from the title.
    data.stakeholderRoleTypeId =
      roleTypeId ?? (await this.classifyRoleTypeId(await this.jobTitleName(dto.jobTitleId)));
    if (coverageLocationIds !== undefined) {
      data.coverage = { create: coverageLocationIds.map((locationId) => ({ locationId })) };
    }
    // displayId is assigned by the DB (Stakeholder_displayId_seq default).
    const stakeholder = await this.prisma.stakeholder.create({
      data,
      include: STAKEHOLDER_INCLUDE,
    });
    return toEntity(stakeholder);
  }

  async update(id: string, dto: UpdateStakeholderDto, user: AuthUser) {
    // Existence + scope check only — its return value isn't needed now that
    // re-parenting no longer falls back to the current coverage list.
    await this.findOne(id, user);

    // Re-parenting only. A coverage-only edit needs no re-check — coverage no
    // longer has any bearing on visibility. Moving the contact onto a
    // *company* the author can't see is the only act that matters: it writes
    // into someone else's book, so the destination client is what's checked.
    if (dto.clientId !== undefined) {
      await this.assertResultInScope(dto.clientId, user);
    }

    const { coverageLocationIds, roleTypeId, ...scalars } = dto;
    const data: Prisma.StakeholderUncheckedUpdateInput = { ...scalars };
    // Re-classify only when the title is actually changing and the caller
    // didn't also set the role type explicitly in the same request.
    if (roleTypeId !== undefined) {
      data.stakeholderRoleTypeId = roleTypeId;
    } else if (dto.jobTitleId !== undefined) {
      data.stakeholderRoleTypeId = await this.classifyRoleTypeId(await this.jobTitleName(dto.jobTitleId));
    }
    // Coverage is a to-many join, not a scalar — full list replace is simplest
    // and correct; a stakeholder's coverage list is short.
    if (coverageLocationIds !== undefined) {
      data.coverage = {
        deleteMany: {},
        create: coverageLocationIds.map((locationId) => ({ locationId })),
      };
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
        category: dto.category,
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
