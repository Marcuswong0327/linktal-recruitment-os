import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CandidateStatus, ContactCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { RequestContext } from '../common/request-context';
import { candidateScope, isScoped } from '../common/scope';
import { AuthUser } from '../auth/auth.types';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { QueryCandidatesDto } from './dto/query-candidates.dto';
import { CreateCandidateContactHistoryDto } from './dto/create-candidate-contact-history.dto';
import { QueryCandidateFacetsDto } from './dto/query-candidate-facets.dto';
import { ExportCandidatesDto } from './dto/export-candidates.dto';
import { UpdateCandidateContactHistoryDto } from './dto/update-candidate-contact-history.dto';
import { buildWorkbook, resolveTimeZone, splitContactDateTime, ExportColumn } from '../common/xlsx-export';
import { logExport } from '../common/audit-export';
import { buildLocationById, locationBreadcrumbPath } from '../common/xlsx-import';

/** The subset of QueryCandidatesDto that `buildWhere` actually reads — shared with QueryCandidateFacetsDto, which omits pagination/sort/jobRoleTypeIds but still satisfies this structurally. */
type CandidateFilterFields = Pick<
  QueryCandidatesDto,
  | 'q'
  | 'statuses'
  | 'industryIds'
  | 'jobRoleTypeIds'
  | 'specializationIds'
  | 'submissionStatuses'
  | 'placementStatuses'
  | 'locationIds'
  | 'location'
  | 'currentCompany'
  | 'currentRole'
  | 'lastContactedFrom'
  | 'lastContactedTo'
>;

// lastContactedAt is a plain scalar column (see schema.prisma) — denormalized
// for sorting, same reasoning as Client/Stakeholder.lastContactedAt. The rest
// of the "latest contact" detail isn't sorted or filtered on, so it's resolved
// live from the top-1 contact history row — display-only, cheap per row.
//
// industry/jobRoleType/location are FK relations, flattened back onto the
// entity as plain strings in `toEntity` so the API shape stays flat.
// `ancestorIds` comes along on the location purely for the single-record scope
// check, and is stripped back out — never part of the response.
const CANDIDATE_INCLUDE = {
  contactHistory: {
    orderBy: { contactedAt: 'desc' },
    take: 1,
    select: {
      contactType: true,
      category: true,
      screeningNotes: true,
      outreachCampaignNotes: true,
      contactedAt: true,
      contactedBy: { select: { fullName: true } },
      currentSalary: true,
      expectedSalary: true,
    },
  },
  industry: { select: { name: true } },
  jobRoleType: { select: { name: true } },
  location: { select: { name: true, level: true, ancestorIds: true } },
  // specializationId (the join row's own scalar) is kept alongside the resolved
  // name — the name is display-only, the id is what an editable multi-select
  // needs to preselect and diff against.
  specializations: { select: { specializationId: true, specialization: { select: { name: true } } } },
} satisfies Prisma.CandidateInclude;

type CandidateWithRelations = {
  contactHistory: {
    contactType: string | null;
    category: ContactCategory;
    screeningNotes: string | null;
    outreachCampaignNotes: string | null;
    contactedAt: Date;
    contactedBy: { fullName: string } | null;
    currentSalary: string | null;
    expectedSalary: string | null;
  }[];
  industry: { name: string } | null;
  jobRoleType: { name: string } | null;
  location: { name: string; level: string; ancestorIds: string[] } | null;
  specializations: { specializationId: string; specialization: { name: string } }[];
};

/**
 * The fields `buildExportWorkbook` reads off a `toEntity`-shaped row — kept
 * separate from the generic `toEntity<T>` return type, which erases extra
 * fields when used across a second generic boundary. `locationPath` isn't
 * something `toEntity` produces (it strips `ancestorIds` before returning) —
 * `exportAll`/`exportByIds` compute it separately and merge it in, same
 * pattern as ClientsService's `locationPaths`.
 */
type CandidateExportRow = {
  displayId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  locationPath: string | null;
  industry: string | null;
  jobRoleType: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  linkedinUrl: string | null;
  seekTalentUrl: string | null;
  rawResumeUrl: string | null;
  editedResumeUrl: string | null;
  specializations: string[];
  status: CandidateStatus;
  lastContactedAt: Date | null;
  lastContactType: string | null;
  lastContactedBy: string | null;
  lastContactNotes: string | null;
};

function toEntity<T extends CandidateWithRelations>(candidate: T) {
  const { contactHistory, industry, jobRoleType, location, specializations, ...rest } = candidate;
  const latest = contactHistory[0];
  return {
    ...rest,
    industry: industry?.name ?? null,
    jobRoleType: jobRoleType?.name ?? null,
    location: location?.name ?? null,
    locationLevel: location?.level ?? null,
    specializations: specializations.map((s) => s.specialization.name),
    specializationIds: specializations.map((s) => s.specializationId),
    lastContactType: latest?.contactType ?? null,
    lastContactCategory: latest?.category ?? null,
    // Screening and outreach notes are separate fields, distinguished by
    // `category` — only one is ever populated per row.
    lastContactNotes: latest?.screeningNotes ?? latest?.outreachCampaignNotes ?? null,
    lastContactedBy: latest?.contactedBy?.fullName ?? null,
    // Resolved live from the same latest-contact row as the fields above —
    // deliberately kept separate from the denormalized `lastContactedAt`
    // column (which only reflects contacts logged through this API; imported
    // history never backfilled it). A UI showing a date must draw from
    // exactly the field it also sorts/filters by, or a row can display "3
    // months ago" while a "3+ months" filter silently excludes it.
    lastContactDate: latest?.contactedAt ?? null,
    // Same latest-contact row, same free-text-not-numbers reasoning as the
    // column comment on CandidateContactHistory — display-only, no sort/filter.
    currentSalary: latest?.currentSalary ?? null,
    expectedSalary: latest?.expectedSalary ?? null,
  };
}

/** contains/insensitive text filter — undefined when the value is empty, so it's omitted from `where` rather than matching everything. */
function contains(value?: string) {
  return value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
}

/**
 * Split the JSON columns and the specializationIds relation out of the DTO.
 * Class instances don't structurally satisfy Prisma's `InputJsonValue` (no
 * index signature), so JSON fields are cast explicitly while the scalar
 * fields keep their compile-time checks. `specializationIds` is a nested
 * relation write, not a column — callers (create/update) build that part
 * of the payload themselves from `dto.specializationIds` directly. Exported
 * (not a private method) for the same reason as ClientsService's — doesn't
 * touch `this`, so hoisting is a zero-risk move.
 */
export function toPrismaData<T extends CreateCandidateDto | UpdateCandidateDto>(dto: T) {
  const { workHistory, historicFiles, otherDocuments, specializationIds: _specializationIds, ...rest } = dto;
  return {
    ...rest,
    ...(workHistory !== undefined
      ? { workHistory: workHistory as unknown as Prisma.InputJsonValue }
      : {}),
    ...(historicFiles !== undefined
      ? { historicFiles: historicFiles as unknown as Prisma.InputJsonValue }
      : {}),
    ...(otherDocuments !== undefined
      ? { otherDocuments: otherDocuments as unknown as Prisma.InputJsonValue }
      : {}),
  };
}

@Injectable()
export class CandidatesService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  /**
   * Shared by `findAll` and `jobRoleTypeFacets` — every list/count/facet read
   * against Candidate applies the same filters and scope, just with a
   * different set of rows selected out of the result. `omit` drops one
   * condition from the AND list: facets pass `jobRoleTypeIds` so a facet
   * count answers "how many if I added this on top of everything else",
   * not "how many after I've already applied it" (which would make every
   * count 0 or the current total).
   */
  private buildWhere(
    query: CandidateFilterFields,
    user: AuthUser,
    omit: { jobRoleTypeIds?: boolean } = {},
  ): Prisma.CandidateWhereInput {
    const { q } = query;

    // Built as an AND-ed list of independent conditions rather than
    // assigning fields onto one `where` object, since a condition here needs
    // its own `OR` (the free-text q) — top-level `where.OR` assignments would
    // just clobber each other.
    const and: Prisma.CandidateWhereInput[] = [];

    if (query.statuses?.length) and.push({ status: { in: query.statuses } });
    if (query.industryIds?.length) and.push({ industryId: { in: query.industryIds } });
    if (!omit.jobRoleTypeIds && query.jobRoleTypeIds?.length) {
      and.push({ jobRoleTypeId: { in: query.jobRoleTypeIds } });
    }
    if (query.specializationIds?.length) {
      and.push({ specializations: { some: { specializationId: { in: query.specializationIds } } } });
    }
    if (isScoped(user)) and.push(candidateScope(user));
    if (query.submissionStatuses?.length) {
      and.push({ submissions: { some: { status: { in: query.submissionStatuses } } } });
    }
    if (query.placementStatuses?.length) {
      and.push({ submissions: { some: { placement: { status: { in: query.placementStatuses } } } } });
    }
    // Location is a node in the tree now: selecting a country matches every
    // candidate beneath it, via the denormalized ancestor path.
    if (query.locationIds?.length) {
      and.push({ location: { ancestorIds: { hasSome: query.locationIds } } });
    }
    if (query.location) {
      and.push({
        location: { name: { contains: query.location, mode: Prisma.QueryMode.insensitive } },
      });
    }
    const companyFilter = contains(query.currentCompany);
    if (companyFilter) and.push({ currentCompany: companyFilter });
    const roleFilter = contains(query.currentRole);
    if (roleFilter) and.push({ currentRole: roleFilter });

    if (query.lastContactedFrom || query.lastContactedTo) {
      and.push({
        lastContactedAt: {
          ...(query.lastContactedFrom ? { gte: new Date(query.lastContactedFrom) } : {}),
          ...(query.lastContactedTo ? { lte: new Date(query.lastContactedTo) } : {}),
        },
      });
    }

    // Quick search: scalar columns (backed by the trigram indexes added in
    // 20260719021500_candidate_search_trigram_indexes) plus the resolved names
    // of location, industry and job role type via relation. Specializations
    // are deliberately left out — substring matching inside a joined
    // many-to-many isn't worth the complexity for free-text search; they're
    // filter-only (specializationIds).
    if (q) {
      and.push({
        OR: [
          { firstName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { lastName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { currentCompany: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { currentRole: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { location: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          { mobile: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { industry: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
          { jobRoleType: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } },
        ],
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  /** Shared by `findAll` and `exportAll` so the exported sheet mirrors the grid's current sort exactly. */
  private buildOrderBy(
    sortBy: QueryCandidatesDto['sortBy'],
    sortOrder: QueryCandidatesDto['sortOrder'],
  ): Prisma.CandidateOrderByWithRelationInput[] {
    return [
      !sortBy
        ? { createdAt: 'desc' }
        : sortBy === 'lastContactedAt'
          ? { lastContactedAt: { sort: sortOrder, nulls: 'last' } }
          : { [sortBy]: sortOrder },
      { id: 'asc' },
    ];
  }

  async findAll(query: QueryCandidatesDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);

    // status sorts by Postgres's native enum ordinal (COLD < WARM < PLACED <
    // UNS, per the declaration order in schema.prisma) — no CASE expression
    // needed, `ORDER BY "status"` already gives the temperature order.
    // lastContactedAt is nullable (see schema.prisma) and most rows don't
    // have it populated yet (imported contact history never backfilled the
    // denormalized column — see CandidatesService doc), so an ascending sort
    // needs nulls pushed to the end; otherwise every never-contacted
    // candidate would flood the front of an "oldest contact first" list.
    // `id` is appended as a tiebreaker on every sort — the primary column
    // alone routinely ties (most rows share the same imported `createdAt`,
    // and `lastContactedAt` is null for the vast majority), and Postgres
    // doesn't guarantee a stable order across separate paginated queries for
    // tied rows. Without it, paging (or infinite-scroll's page-by-page
    // accumulation) can silently return the same row twice or skip one.
    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: CANDIDATE_INCLUDE,
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return { data: data.map(toEntity), total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  /**
   * How many candidates match the current filters *for each Role Type* —
   * powers the "Fitter (793)" style counts next to the primary search
   * filter. `jobRoleTypeIds` itself is excluded from the where clause (see
   * `buildWhere`'s `omit` doc) so picking one option doesn't zero out the
   * rest. Nulls (the 0.6% with no role type set) are dropped — nothing to
   * facet on.
   */
  async jobRoleTypeFacets(query: QueryCandidateFacetsDto, user: AuthUser) {
    const where = this.buildWhere(query, user, { jobRoleTypeIds: true });
    const grouped = await this.prisma.candidate.groupBy({
      by: ['jobRoleTypeId'],
      where: { ...where, jobRoleTypeId: { not: null } },
      _count: true,
      orderBy: { _count: { jobRoleTypeId: 'desc' } },
    });
    const ids = grouped.map((g) => g.jobRoleTypeId).filter((id): id is string => id !== null);
    const roleTypes = await this.base.jobRoleType.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(roleTypes.map((r) => [r.id, r.name]));
    return grouped
      .filter((g) => g.jobRoleTypeId && nameById.has(g.jobRoleTypeId))
      .map((g) => ({ id: g.jobRoleTypeId as string, name: nameById.get(g.jobRoleTypeId as string)!, count: g._count }));
  }

  /**
   * Resolves each candidate's location to a full breadcrumb path — the exact
   * format CANDIDATE_IMPORT_COLUMNS (candidates-import.service.ts) expects
   * for its required Location column, so an exported sheet actually
   * re-imports. Not something `toEntity` produces (it strips `ancestorIds`
   * before returning) — same pattern as ClientsService's `locationPaths`.
   */
  private async withLocationPath<T extends CandidateWithRelations>(
    candidates: T[],
  ): Promise<(T & { locationPath: string | null })[]> {
    const allLocations = await this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true } });
    const byId = buildLocationById(allLocations);
    return candidates.map((c) => ({
      ...c,
      locationPath: c.location ? locationBreadcrumbPath(c.location, byId) : null,
    }));
  }

  /** Every row matching the current filters, unbounded — no `skip`/`take`. */
  async exportAll(query: ExportCandidatesDto, user: AuthUser): Promise<Buffer> {
    const where = this.buildWhere(query, user);
    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);
    const candidates = await this.prisma.candidate.findMany({ where, orderBy, include: CANDIDATE_INCLUDE });
    const { timezone: _timezone, ...filters } = query;
    await logExport(this.base, 'Candidate', { count: candidates.length, filters });
    const withPath = await this.withLocationPath(candidates);
    return this.buildExportWorkbook(withPath.map(toEntity), query.timezone);
  }

  /** An explicit row selection — scope is still re-applied server-side (defense-in-depth), so an out-of-scope id is silently dropped rather than exported. */
  async exportByIds(ids: string[], user: AuthUser, timezone?: string): Promise<Buffer> {
    const and: Prisma.CandidateWhereInput[] = [{ id: { in: ids } }];
    if (isScoped(user)) and.push(candidateScope(user));
    const candidates = await this.prisma.candidate.findMany({ where: { AND: and }, include: CANDIDATE_INCLUDE });
    await logExport(this.base, 'Candidate', { count: candidates.length, requestedIds: ids });
    const withPath = await this.withLocationPath(candidates);
    return this.buildExportWorkbook(withPath.map(toEntity), timezone);
  }

  private buildExportWorkbook(candidates: CandidateExportRow[], timezone?: string): Promise<Buffer> {
    const tz = resolveTimeZone(timezone);
    // Header text and value format (Location: full breadcrumb path;
    // Specializations: `;`-separated bare names; Status: the raw enum text,
    // not a humanized label — "Unsuccessful" wouldn't match the "UNS" import
    // expects) are deliberately identical to CANDIDATE_IMPORT_COLUMNS
    // (candidates-import.service.ts), for the same "Export to Excel → edit →
    // re-upload" round trip ImportDialog's own instructions promise.
    const columns: ExportColumn[] = [
      { header: 'Display ID', key: 'displayId' },
      { header: 'First Name', key: 'firstName' },
      { header: 'Last Name', key: 'lastName' },
      { header: 'Email', key: 'email' },
      { header: 'Mobile', key: 'mobile' },
      { header: 'Location', key: 'location', required: true },
      { header: 'Industry', key: 'industry', required: true },
      { header: 'Job Role Type', key: 'jobRoleType' },
      { header: 'Current Role', key: 'currentRole' },
      { header: 'Current Company', key: 'currentCompany' },
      { header: 'LinkedIn URL', key: 'linkedinUrl' },
      { header: 'Seek Talent URL', key: 'seekTalentUrl' },
      { header: 'Raw Resume URL', key: 'rawResumeUrl' },
      { header: 'Edited Resume URL', key: 'editedResumeUrl' },
      { header: 'Specializations', key: 'specializations' },
      { header: 'Status', key: 'status', required: true },
      { header: 'Last Contacted Date', key: 'lastContactedDate' },
      { header: 'Last Contacted Time', key: 'lastContactedTime' },
      { header: 'Last Contact Method', key: 'lastContactType' },
      { header: 'Last Contacted By', key: 'lastContactedBy' },
      { header: 'Last Contact Notes', key: 'lastContactNotes', wrap: true },
    ];
    const rows = candidates.map((c) => {
      const { date, time } = splitContactDateTime(c.lastContactedAt, tz);
      return {
        displayId: c.displayId,
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        email: c.email ?? '',
        mobile: c.mobile ?? '',
        location: c.locationPath ?? '',
        industry: c.industry ?? '',
        jobRoleType: c.jobRoleType ?? '',
        currentRole: c.currentRole ?? '',
        currentCompany: c.currentCompany ?? '',
        linkedinUrl: c.linkedinUrl ?? '',
        seekTalentUrl: c.seekTalentUrl ?? '',
        rawResumeUrl: c.rawResumeUrl ?? '',
        editedResumeUrl: c.editedResumeUrl ?? '',
        specializations: c.specializations.join('; '),
        status: c.status,
        lastContactedDate: date,
        lastContactedTime: time,
        lastContactType: c.lastContactType ?? '',
        lastContactedBy: c.lastContactedBy ?? '',
        lastContactNotes: c.lastContactNotes ?? '',
      };
    });
    return buildWorkbook('Candidates', columns, rows);
  }

  /**
   * Single-record access is unguarded by scope — scope only ever filters
   * `findAll`. `user` is accepted for signature symmetry with the other
   * services but unused here now.
   */
  async findOne(id: string, _user: AuthUser) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: CANDIDATE_INCLUDE,
    });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    return toEntity(candidate);
  }

  async findByDisplayId(displayId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { displayId },
      include: CANDIDATE_INCLUDE,
    });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${displayId} not found`);
    }
    return toEntity(candidate);
  }

  async create(dto: CreateCandidateDto, _user: AuthUser) {
    // displayId is assigned by the DB (Candidate_displayId_seq default).
    const candidate = await this.prisma.candidate.create({
      data: {
        ...toPrismaData(dto),
        ...(dto.specializationIds !== undefined
          ? { specializations: { create: dto.specializationIds.map((specializationId) => ({ specializationId })) } }
          : {}),
      },
      include: CANDIDATE_INCLUDE,
    });
    return toEntity(candidate);
  }

  async update(id: string, dto: UpdateCandidateDto, user: AuthUser) {
    await this.findOne(id, user);

    const candidate = await this.prisma.candidate.update({
      where: { id },
      data: {
        ...toPrismaData(dto),
        // Specializations is a to-many join, not a scalar column — a full
        // list replace (clear then recreate) is simplest and correct here;
        // a candidate's specialization list is short, so there's no need for
        // a diffing update.
        ...(dto.specializationIds !== undefined
          ? {
              specializations: {
                deleteMany: {},
                create: dto.specializationIds.map((specializationId) => ({ specializationId })),
              },
            }
          : {}),
      },
      include: CANDIDATE_INCLUDE,
    });

    return toEntity(candidate);
  }

  /**
   * Soft-deletes the candidate. Cascading to its submissions and their
   * placements is handled centrally by the Prisma extension's CASCADE_MAP —
   * see prisma.extensions.ts.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.candidate.delete({ where: { id } });
  }

  /** Restores a soft-deleted candidate (audited as RESTORE). Does not un-delete
   * its children — the FE recovers those explicitly if needed. */
  async restore(id: string) {
    const existing = await this.base.candidate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Candidate ${id} is not deleted`);
    }
    const candidate = await this.prisma.candidate.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: CANDIDATE_INCLUDE,
    });
    return toEntity(candidate);
  }

  /**
   * Permanently deletes the candidate + its screening/submission/placement
   * history via the base client (bypasses the soft-delete rewrite). Admin-only
   * — for genuine erasure (e.g. a data-removal request). Writes a HARD_DELETE
   * audit row before the row is gone.
   */
  async purge(id: string) {
    const existing = await this.base.candidate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'Candidate',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.candidate.delete({ where: { id } });
  }

  /**
   * Logs a contact and bumps the denormalized lastContactedAt — but only if
   * this contact is newer than what's already stored (a backdated log entry
   * shouldn't clobber a more recent one). contactedById always comes from
   * the caller's own session (never the request body) — a contact can only
   * ever be attributed to whoever is actually submitting it.
   */
  async addContactHistory(id: string, dto: CreateCandidateContactHistoryDto, consultantId: string) {
    const candidate = await this.base.candidate.findUnique({
      where: { id },
      select: { lastContactedAt: true },
    });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    const contactedAt = dto.contactedAt ? new Date(dto.contactedAt) : new Date();

    const created = await this.prisma.candidateContactHistory.create({
      data: {
        candidateId: id,
        contactType: dto.contactType,
        category: dto.category,
        screeningNotes: dto.screeningNotes,
        outreachCampaignNotes: dto.outreachCampaignNotes,
        outreachChannel: dto.outreachChannel,
        status: dto.status,
        suburb: dto.suburb,
        currentSalary: dto.currentSalary,
        expectedSalary: dto.expectedSalary,
        contactedAt,
        contactedById: consultantId,
      },
    });

    if (!candidate.lastContactedAt || contactedAt > candidate.lastContactedAt) {
      await this.prisma.candidate.update({ where: { id }, data: { lastContactedAt: contactedAt } });
    }

    return created;
  }

  /** Every logged contact for this candidate, newest first — there's no other way to see the full history, only the denormalized "latest contact" fields on the candidate itself. */
  /** Newest first, capped at `limit` (default 5, see QueryContactHistoryDto) — the FE only needs to pass it to see further back. */
  async listContactHistory(candidateId: string, limit: number) {
    return this.prisma.candidateContactHistory.findMany({
      where: { candidateId },
      orderBy: { contactedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Editing is deliberately narrow: only `screeningNotes` on a SCREENING row
   * can be changed. contactType/category/contactedAt/outreachChannel/
   * outreachCampaignNotes stay immutable once logged — each row is a factual
   * record of "a contact happened", not a note timeline. Restricted to the
   * row's own author or an admin (unlike *creating* a new contact-history
   * row, which any consultant with candidate:update can do regardless of
   * scope — this is about not letting someone silently rewrite what a
   * different consultant already logged).
   */
  async updateContactHistory(
    candidateId: string,
    id: string,
    dto: UpdateCandidateContactHistoryDto,
    user: AuthUser,
  ) {
    const row = await this.base.candidateContactHistory.findUnique({ where: { id } });
    if (!row || row.candidateId !== candidateId) {
      throw new NotFoundException(`Contact history ${id} not found`);
    }
    if (row.category !== 'SCREENING') {
      throw new BadRequestException({
        code: 'NOT_SCREENING_CONTACT',
        message: 'Only screening contacts can be edited.',
      });
    }
    if (row.contactedById !== user.consultantId && user.roleName !== 'admin') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: "Only the contact's author or an admin can edit it.",
      });
    }
    this.assertContactHistoryNotStale(row, dto.expectedVersion);

    return this.prisma.candidateContactHistory.update({
      where: { id },
      data: { screeningNotes: dto.screeningNotes, editedAt: new Date(), editedById: user.consultantId },
    });
  }

  /**
   * Optimistic concurrency check: rejects the edit if the row changed since
   * the caller last read it (detected by comparing `editedAt ?? createdAt`),
   * so a second edit can't silently clobber one that landed moments before
   * it. Skipped when the caller doesn't pass `expectedVersion` at all.
   */
  private assertContactHistoryNotStale(
    row: { editedAt: Date | null; createdAt: Date },
    expectedVersion: string | undefined,
  ) {
    const version = (row.editedAt ?? row.createdAt).toISOString();
    if (expectedVersion !== undefined && version !== expectedVersion) {
      throw new ConflictException({
        code: 'CONTACT_HISTORY_CONFLICT',
        message: 'This contact was changed by someone else. Reload and try again.',
      });
    }
  }

}
