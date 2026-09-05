import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StakeholderStatus } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { isScoped, stakeholderScope } from '../common/scope';
import { AuthUser } from '../auth/auth.types';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { UpdateStakeholderDto } from './dto/update-stakeholder.dto';
import { AccuracyFilter, QueryStakeholdersDto } from './dto/query-stakeholders.dto';
import { CreateStakeholderContactHistoryDto } from './dto/create-stakeholder-contact-history.dto';
import { ExportStakeholdersDto } from './dto/export-stakeholders.dto';
import { EnrichmentStakeholdersDto } from './dto/enrichment-stakeholders.dto';
import { classifyJobTitle } from './role-type-classifier';
import { buildWorkbook, resolveTimeZone, splitContactDateTime, ExportColumn } from '../common/xlsx-export';
import { logExport } from '../common/audit-export';
import { searchTokens } from '../common/search-tokens';

/** The subset of QueryStakeholdersDto that `buildWhere` actually reads — shared with the export endpoint, which omits pagination/sort but still satisfies this structurally. */
type StakeholderFilterFields = Pick<
  QueryStakeholdersDto,
  'q' | 'clientId' | 'clientIds' | 'jobTitle' | 'roleTypeIds' | 'jobTitleIds' | 'locationIds' | 'accuracy' | 'statuses'
>;

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
  // displayId feeds the export sheet's Client Display ID column — required
  // to match STAKEHOLDER_IMPORT_COLUMNS (stakeholders-import.service.ts) on
  // a re-uploaded export, since companyName alone can't resolve back to a
  // specific client (names aren't guaranteed unique).
  client: { select: { companyName: true, displayId: true } },
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
  client: { companyName: string; displayId: string } | null;
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

// Same bounded-bulk-operation ceiling as MAX_IMPORT_ROWS (xlsx-import.ts) and
// SELECT_ALL_CAP (CandidatesTable.tsx) — the enrichment workspace is a
// hand-picked set of companies, never realistically this large; this exists
// only to fail loudly instead of returning an unbounded result set.
const MAX_ENRICHMENT_ROWS = 5000;

const STAKEHOLDER_STATUS_LABELS: Record<StakeholderStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  UNS: 'UNS',
  DATA_NOT_ACCURATE: 'Data Not Accurate',
};

/**
 * The fields `buildExportWorkbook` reads off a `toEntity`-shaped row — kept
 * separate from the generic `toEntity<T>` return type, which erases extra
 * fields when used across a second generic boundary. `coveragePaths` isn't
 * something `toEntity` produces (it strips `ancestorIds` before returning) —
 * `exportAll`/`exportByIds` compute it separately and merge it in, same
 * pattern as ClientsService's `locationPaths`.
 */
type StakeholderExportRow = {
  displayId: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  clientDisplayId: string | null;
  coveragePaths: string[];
  roleType: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  email: string | null;
  mobile: string | null;
  status: StakeholderStatus;
  isAccurate: boolean | null;
  inaccurateReason: string | null;
  lastContactedAt: Date | null;
  lastContactType: string | null;
  lastContactedBy: string | null;
  lastContactNotes: string | null;
};

/**
 * Looks up (or creates) the catalog row for a keyword-classified jobTitle.
 * Only called when the caller doesn't explicitly set `roleTypeId` — an
 * explicit value (including `null`, to clear it) always wins. Exported (not
 * a private method) so StakeholdersImportService can reuse this exact rule
 * inside its own transaction, passing `tx` instead of the live-request base
 * client — StakeholderRoleType is combobox-growable by anyone (see
 * schema.prisma), so an import row naming an unseen one auto-creates it,
 * same as this classifier already does for a jobTitle-derived guess.
 */
export async function classifyRoleTypeId(
  db: PrismaService | Prisma.TransactionClient,
  jobTitle: string | null | undefined,
): Promise<string> {
  const name = classifyJobTitle(jobTitle);
  const roleType = await db.stakeholderRoleType.upsert({
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
 * treats as "Other". Exported for the same reason as `classifyRoleTypeId`.
 */
export async function jobTitleName(
  db: PrismaService | Prisma.TransactionClient,
  jobTitleId: string | null | undefined,
): Promise<string | null> {
  if (!jobTitleId) return null;
  const row = await db.jobTitle.findUnique({
    where: { id: jobTitleId },
    select: { name: true },
  });
  return row?.name ?? null;
}

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
   * Shared by `findAll` and the export endpoint — every list/export read
   * against Stakeholder applies the same filters and scope, just with a
   * different set of rows selected out of the result.
   */
  private buildWhere(query: StakeholderFilterFields, user: AuthUser): Prisma.StakeholderWhereInput {
    const { q } = query;

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

    // One AND-ed clause per whitespace-separated term, each OR-ed across the
    // searchable columns — so "Dr Joe" matches firstName "Dr" + lastName
    // "Joe". A single `contains "Dr Joe"` can't: the two names are stored in
    // separate columns and nothing concatenates them. Single-word queries are
    // one term, i.e. exactly the previous behaviour.
    if (q) {
      for (const term of searchTokens(q)) {
        and.push({
          OR: [
            { firstName: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { lastName: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { displayId: { contains: term, mode: Prisma.QueryMode.insensitive } },
            { mobile: { contains: term, mode: Prisma.QueryMode.insensitive } },
          ],
        });
      }
    }

    // Matched against the stakeholder's OWN coverage, not its client's
    // location — same ancestor-path semantics as Client.locationIds.
    // Selecting a country/state matches every stakeholder whose coverage
    // sits beneath it.
    if (query.locationIds?.length) {
      and.push({ coverage: { some: { location: { ancestorIds: { hasSome: query.locationIds } } } } });
    }

    // isAccurate is nullable (three states) — 'unchecked' means null, which
    // Prisma's `in` never matches (SQL NULL semantics), so each selected
    // token becomes its own OR arm rather than a single `in` filter.
    if (query.accuracy?.length) {
      const accuracyConditions: Prisma.StakeholderWhereInput[] = [];
      if (query.accuracy.includes(AccuracyFilter.Accurate)) accuracyConditions.push({ isAccurate: true });
      if (query.accuracy.includes(AccuracyFilter.Inaccurate)) accuracyConditions.push({ isAccurate: false });
      if (query.accuracy.includes(AccuracyFilter.Unchecked)) accuracyConditions.push({ isAccurate: null });
      and.push({ OR: accuracyConditions });
    }

    if (query.statuses?.length) {
      where.status = { in: query.statuses };
    }

    if (isScoped(user)) {
      and.push(stakeholderScope(user));
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  /** Shared by `findAll` and `exportAll` so the exported sheet mirrors the grid's current sort exactly. */
  private buildOrderBy(
    sortBy: QueryStakeholdersDto['sortBy'],
    sortOrder: QueryStakeholdersDto['sortOrder'],
  ): Prisma.StakeholderOrderByWithRelationInput[] {
    return [
      sortBy === 'lastContactedAt'
        ? { lastContactedAt: { sort: sortOrder, nulls: 'last' } }
        : sortBy
          ? { [sortBy]: sortOrder }
          : { createdAt: 'desc' },
      { id: 'asc' },
    ];
  }

  async findAll(query: QueryStakeholdersDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);

    // lastContactedAt is null for stakeholders with no contact history yet —
    // "nulls: last" keeps those at the bottom regardless of sort direction
    // (mirrors Client.lastContactedAt's ordering).
    // `id` is appended as a tiebreaker on every sort — the primary column
    // alone routinely ties (most stakeholders share `lastContactedAt: null`,
    // and any other sortable field can tie too), and Postgres doesn't
    // guarantee a stable order across separate paginated queries for tied
    // rows. Without it, paging (or infinite-scroll's page-by-page
    // accumulation) can silently return the same row twice or skip one.
    const orderBy = this.buildOrderBy(sortBy, sortOrder);

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

  /**
   * Resolves each stakeholder's client displayId and coverage locations to
   * their (now globally unique) names — the exact format
   * STAKEHOLDER_IMPORT_COLUMNS (stakeholders-import.service.ts) expects for
   * Client Display ID/Coverage Locations, so an exported sheet actually
   * re-imports. Neither field survives `toEntity` in that shape (it resolves
   * `client` down to just `companyName`, and strips `coverage`'s
   * `ancestorIds`), so this computes them from the raw Prisma rows and merges
   * them in as extra fields `toEntity`'s return type doesn't otherwise carry
   * — same pattern as ClientsService's `withLocationPaths`.
   */
  private withExportExtras<T extends StakeholderWithRelations>(
    stakeholders: T[],
  ): (T & { clientDisplayId: string | null; coveragePaths: string[] })[] {
    return stakeholders.map((s) => ({
      ...s,
      clientDisplayId: s.client?.displayId ?? null,
      coveragePaths: s.coverage.map((c) => c.location.name),
    }));
  }

  /** Every row matching the current filters, unbounded — no `skip`/`take`. */
  async exportAll(query: ExportStakeholdersDto, user: AuthUser): Promise<Buffer> {
    const where = this.buildWhere(query, user);
    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);
    const stakeholders = await this.prisma.stakeholder.findMany({ where, orderBy, include: STAKEHOLDER_INCLUDE });
    const { timezone: _timezone, ...filters } = query;
    await logExport(this.base, 'Stakeholder', { count: stakeholders.length, filters });
    const withExtras = await this.withExportExtras(stakeholders);
    return this.buildExportWorkbook(withExtras.map(toEntity), query.timezone);
  }

  /** An explicit row selection — scope is still re-applied server-side (defense-in-depth, delegated to the client's scope, same as `findAll`), so an out-of-scope id is silently dropped rather than exported. */
  async exportByIds(ids: string[], user: AuthUser, timezone?: string): Promise<Buffer> {
    const and: Prisma.StakeholderWhereInput[] = [{ id: { in: ids } }];
    if (isScoped(user)) and.push(stakeholderScope(user));
    const stakeholders = await this.prisma.stakeholder.findMany({ where: { AND: and }, include: STAKEHOLDER_INCLUDE });
    await logExport(this.base, 'Stakeholder', { count: stakeholders.length, requestedIds: ids });
    const withExtras = await this.withExportExtras(stakeholders);
    return this.buildExportWorkbook(withExtras.map(toEntity), timezone);
  }

  /**
   * Backs the cross-company enrichment workspace: every stakeholder across
   * an explicit, required set of companies, unbounded (no `skip`/`take`) —
   * same "return everything matching" shape as `exportAll`, but JSON
   * entities instead of a workbook, since this feeds a live grid rather than
   * a download. `MAX_ENRICHMENT_ROWS` is a safety net, not a real limit: a
   * hand-picked company selection never realistically approaches it.
   */
  async findForEnrichment(query: EnrichmentStakeholdersDto, user: AuthUser) {
    const where = this.buildWhere(query, user);
    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);
    const total = await this.prisma.stakeholder.count({ where });
    if (total > MAX_ENRICHMENT_ROWS) {
      throw new BadRequestException({
        code: 'TOO_MANY_ROWS',
        message: `${total} stakeholders match this selection; the enrichment workspace supports up to ${MAX_ENRICHMENT_ROWS}. Narrow the company selection.`,
      });
    }
    const stakeholders = await this.prisma.stakeholder.findMany({ where, orderBy, include: STAKEHOLDER_INCLUDE });
    return stakeholders.map(toEntity);
  }

  private buildExportWorkbook(stakeholders: StakeholderExportRow[], timezone?: string): Promise<Buffer> {
    const tz = resolveTimeZone(timezone);
    // Header text and value format (Coverage Locations: `;`-separated
    // breadcrumb paths; Details Accurate: Yes/No/blank, never "Unchecked" —
    // blank is this field's own accepted way to say "not yet checked") are
    // deliberately identical to STAKEHOLDER_IMPORT_COLUMNS
    // (stakeholders-import.service.ts), for the same "Export to Excel → edit
    // → re-upload" round trip ImportDialog's own instructions promise.
    const columns: ExportColumn[] = [
      { header: 'Display ID', key: 'displayId' },
      { header: 'Client Display ID', key: 'clientDisplayId', required: true },
      { header: 'First Name', key: 'firstName' },
      { header: 'Last Name', key: 'lastName' },
      { header: 'Job Title', key: 'jobTitle' },
      { header: 'Role Type', key: 'roleType' },
      { header: 'LinkedIn URL', key: 'linkedinUrl' },
      { header: 'Email', key: 'email' },
      { header: 'Mobile', key: 'mobile' },
      { header: 'Coverage Locations', key: 'coverageLocations' },
      { header: 'Details Accurate', key: 'detailsAccurate' },
      { header: 'Inaccurate Reason', key: 'inaccurateReason' },
      { header: 'Company', key: 'company' },
      { header: 'Status', key: 'status' },
      { header: 'Last Contacted Date', key: 'lastContactedDate' },
      { header: 'Last Contacted Time', key: 'lastContactedTime' },
      { header: 'Last Contact Method', key: 'lastContactType' },
      { header: 'Last Contacted By', key: 'lastContactedBy' },
      { header: 'Last Contact Notes', key: 'lastContactNotes', wrap: true },
    ];
    const rows = stakeholders.map((s) => {
      const { date, time } = splitContactDateTime(s.lastContactedAt, tz);
      return {
        displayId: s.displayId,
        clientDisplayId: s.clientDisplayId ?? '',
        firstName: s.firstName ?? '',
        lastName: s.lastName ?? '',
        jobTitle: s.jobTitle ?? '',
        roleType: s.roleType ?? '',
        linkedinUrl: s.linkedinUrl ?? '',
        email: s.email ?? '',
        mobile: s.mobile ?? '',
        coverageLocations: s.coveragePaths.join('; '),
        detailsAccurate: s.isAccurate === null ? '' : s.isAccurate ? 'Yes' : 'No',
        inaccurateReason: s.inaccurateReason ?? '',
        company: s.companyName ?? '',
        status: STAKEHOLDER_STATUS_LABELS[s.status],
        lastContactedDate: date,
        lastContactedTime: time,
        lastContactType: s.lastContactType ?? '',
        lastContactedBy: s.lastContactedBy ?? '',
        lastContactNotes: s.lastContactNotes ?? '',
      };
    });
    return buildWorkbook('Stakeholders', columns, rows);
  }

  /**
   * Single-record access is unguarded by scope — scope only ever filters
   * `findAll`. `user` is accepted for signature symmetry with the other
   * services but unused here now.
   */
  async findOne(id: string, _user: AuthUser) {
    const stakeholder = await this.prisma.stakeholder.findUnique({
      where: { id },
      include: STAKEHOLDER_INCLUDE,
    });
    if (!stakeholder) {
      throw new NotFoundException(`Stakeholder ${id} not found`);
    }
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

  async create(dto: CreateStakeholderDto, _user: AuthUser) {
    const { coverageLocationIds, roleTypeId, ...scalars } = dto;
    const data: Prisma.StakeholderUncheckedCreateInput = { ...scalars };
    // An explicit role type always wins; otherwise derive one from the title.
    data.stakeholderRoleTypeId =
      roleTypeId ?? (await classifyRoleTypeId(this.base, await jobTitleName(this.base, dto.jobTitleId)));
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
    // Existence check only — scope never gates a direct write.
    await this.findOne(id, user);

    const { coverageLocationIds, roleTypeId, ...scalars } = dto;
    const data: Prisma.StakeholderUncheckedUpdateInput = { ...scalars };
    // Re-classify only when the title is actually changing and the caller
    // didn't also set the role type explicitly in the same request.
    if (roleTypeId !== undefined) {
      data.stakeholderRoleTypeId = roleTypeId;
    } else if (dto.jobTitleId !== undefined) {
      data.stakeholderRoleTypeId = await classifyRoleTypeId(this.base, await jobTitleName(this.base, dto.jobTitleId));
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
   * Logs a contact and bumps the denormalized lastContactedAt (both the
   * stakeholder and its client) and lastContactedById (stakeholder only —
   * Client has no such column, only lastContactedAt) — but only if this
   * contact is newer than what's already stored. A consultant backdating a
   * contact (logging a call from last week) shouldn't clobber a more recent
   * one someone else already logged. contactedById always comes from the
   * caller's own session (never the request body) — a contact can only ever
   * be attributed to whoever is actually submitting it.
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
      await this.prisma.stakeholder.update({
        where: { id },
        data: { lastContactedAt: contactedAt, lastContactedById: consultantId },
      });

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
