import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientQuality, ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { RequestContext } from '../common/request-context';
import { clientScope, isScoped } from '../common/scope';
import { AuthUser } from '../auth/auth.types';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { ExportClientsDto } from './dto/export-clients.dto';
import { buildWorkbook, formatExportDate, resolveTimeZone, ExportColumn } from '../common/xlsx-export';
import { clientStatusLabels, clientQualityLabels } from '../common/export-labels';

/** The subset of QueryClientsDto that `buildWhere` actually reads — shared with the export endpoint, which omits pagination/sort but still satisfies this structurally. */
type ClientFilterFields = Pick<
  QueryClientsDto,
  | 'q'
  | 'statuses'
  | 'qualities'
  | 'industry'
  | 'specialization'
  | 'industryIds'
  | 'specializationIds'
  | 'hasTob'
  | 'locationIds'
  | 'location'
>;

// Industry/specialization are FK relations, not scalars — every read needs
// this to get the resolved name back, and every write needs it to return one
// (ClientEntity documents them as plain `string | null`, not the nested
// `{id, name, ...}` object Prisma would otherwise hand back). `locations` is
// the client's hiring market: a set of nodes at mixed granularity, resolved to
// names + ids the same way.
//
// lastContactType/Category/Notes/By aren't sorted or filtered on (unlike
// lastContactedAt, which is a denormalized column for that reason), so
// they're resolved live instead: each non-deleted stakeholder's own top-1
// contact row (bounded — a client typically has a handful of stakeholders),
// flattened and reduced to the single most recent one in `toEntity`. A
// two-hop "latest across all stakeholders" aggregate isn't expressible as a
// single Prisma relation `orderBy`/`take`, so this fetches the small
// candidate set and picks the max in application code instead of a raw query.
//
// There is no client-side note timeline: client notes live in
// StakeholderContactHistory, which is what this include reads.
const CLIENT_INCLUDE = {
  industry: { select: { name: true } },
  specialization: { select: { name: true } },
  // `ancestorIds` comes along purely for the single-record scope check, and
  // is stripped back out in `toEntity` — never part of the API response.
  locations: { select: { locationId: true, location: { select: { name: true, ancestorIds: true } } } },
  stakeholders: {
    where: { deletedAt: null },
    select: {
      contactHistory: {
        orderBy: { contactedAt: 'desc' },
        take: 1,
        select: {
          contactType: true,
          category: true,
          notes: true,
          contactedAt: true,
          contactedBy: { select: { fullName: true } },
        },
      },
    },
  },
} satisfies Prisma.ClientInclude;

type LatestContactRow = {
  contactType: string | null;
  category: string | null;
  notes: string | null;
  contactedAt: Date;
  contactedBy: { fullName: string } | null;
};

type ClientWithRelations = {
  industry: { name: string } | null;
  specialization: { name: string } | null;
  locations: { locationId: string; location: { name: string; ancestorIds: string[] } }[];
  stakeholders: {
    contactHistory: LatestContactRow[];
  }[];
};

function latestContact(rows: LatestContactRow[]): LatestContactRow | undefined {
  return rows.reduce<LatestContactRow | undefined>(
    (max, row) => (!max || row.contactedAt > max.contactedAt ? row : max),
    undefined,
  );
}

/** contains/insensitive text filter — undefined when the value is empty, so it's omitted from `where` rather than matching everything. */
function contains(value?: string) {
  return value ? { contains: value, mode: Prisma.QueryMode.insensitive } : undefined;
}

/** The fields `buildExportWorkbook` reads off a `toEntity`-shaped row — kept separate from the generic `toEntity<T>` return type, which erases extra fields when used across a second generic boundary. */
type ClientExportRow = {
  companyName: string;
  displayId: string;
  industry: string | null;
  specialization: string | null;
  locations: string[];
  status: ClientStatus;
  quality: ClientQuality;
  website: string | null;
  lastContactedAt: Date | null;
  lastContactedBy: string | null;
  lastContactType: string | null;
  lastContactNotes: string | null;
};

function toEntity<T extends ClientWithRelations>(client: T) {
  const { industry, specialization, locations, stakeholders, ...rest } = client;
  const latest = latestContact(stakeholders.flatMap((s) => s.contactHistory));
  return {
    ...rest,
    industry: industry?.name ?? null,
    specialization: specialization?.name ?? null,
    // Ids alongside names: the names are display-only, the ids are what an
    // editable multi-select needs to preselect and diff against.
    locations: locations.map((l) => l.location.name),
    locationIds: locations.map((l) => l.locationId),
    lastContactType: latest?.contactType ?? null,
    lastContactCategory: latest?.category ?? null,
    lastContactNotes: latest?.notes ?? null,
    lastContactedBy: latest?.contactedBy?.fullName ?? null,
  };
}

@Injectable()
export class ClientsService {
  constructor(
    // Soft-delete + audit aware client for normal reads/writes.
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    // Base (unfiltered) client — needed to see/erase soft-deleted rows (restore/purge).
    private readonly base: PrismaService,
  ) {}

  /**
   * Splits the `locationIds` relation and the JSON columns out of the DTO.
   * Class instances don't structurally satisfy Prisma's `InputJsonValue` (no
   * index signature), so the JSON fields are cast explicitly while the scalar
   * fields keep their compile-time checks. `locationIds` is a nested relation
   * write, not a column — create/update build that part themselves.
   */
  private toPrismaData<T extends CreateClientDto | UpdateClientDto>(dto: T) {
    const { locationIds: _locationIds, addresses, suburbsAndPostcodes, ...rest } = dto;
    return {
      ...rest,
      ...(addresses !== undefined ? { addresses: addresses as Prisma.InputJsonValue } : {}),
      ...(suburbsAndPostcodes !== undefined
        ? { suburbsAndPostcodes: suburbsAndPostcodes as Prisma.InputJsonValue }
        : {}),
    };
  }

  /**
   * A client must always cover at least one Location node (country level at
   * minimum) — the schema can't express "non-empty relation", so it's enforced
   * here. Without it the location arm of the scope resolver has nothing to
   * match on and the client falls out of every consultant's patch.
   */
  private assertHasLocations(locationIds: string[] | undefined): asserts locationIds is string[] {
    if (!locationIds || locationIds.length === 0) {
      throw new BadRequestException({
        code: 'CLIENT_LOCATION_REQUIRED',
        message: 'A client must cover at least one location.',
      });
    }
  }

  /**
   * Shared by `findAll` and the export endpoint — every list/export read
   * against Client applies the same filters and scope, just with a
   * different set of rows selected out of the result.
   */
  private buildWhere(query: ClientFilterFields, user: AuthUser): Prisma.ClientWhereInput {
    const { q } = query;

    const where: Prisma.ClientWhereInput = {};

    if (query.statuses?.length) {
      where.status = { in: query.statuses };
    }

    if (query.qualities?.length) {
      where.quality = { in: query.qualities };
    }

    // contains/insensitive text filters
    const containsName = (value?: string) => {
      const filter = contains(value);
      return filter ? { name: filter } : undefined;
    };
    where.industry = containsName(query.industry);
    where.specialization = containsName(query.specialization);

    if (query.industryIds?.length) {
      where.industryId = { in: query.industryIds };
    }
    if (query.specializationIds?.length) {
      where.specializationId = { in: query.specializationIds };
    }

    // Terms of Business is a one-to-many table now, not a `tobSigned` flag —
    // "has terms on file" is the existence of any Tob row.
    if (query.hasTob != null) {
      where.tobs = query.hasTob ? { some: {} } : { none: {} };
    }

    // Built as an AND-ed list rather than assigning `where.OR` directly —
    // the free-text search below also needs its own `OR`, and a second
    // top-level `where.OR` assignment would silently clobber the first
    // instead of combining with it (see CandidatesService.findAll for the
    // same idiom already established there).
    const and: Prisma.ClientWhereInput[] = [];

    // A client carries a *set* of locations at mixed granularity, so both
    // filters go through the join. Selecting a country matches every client
    // whose market sits beneath it, via the denormalized ancestor path.
    if (query.locationIds?.length) {
      and.push({ locations: { some: { location: { ancestorIds: { hasSome: query.locationIds } } } } });
    }
    if (query.location) {
      and.push({
        locations: {
          some: { location: { name: { contains: query.location, mode: Prisma.QueryMode.insensitive } } },
        },
      });
    }

    if (q) {
      and.push({
        OR: [
          { companyName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { website: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (isScoped(user)) {
      and.push(clientScope(user));
    }

    if (and.length > 0) {
      where.AND = and;
    }

    return where;
  }

  /** Shared by `findAll` and `exportAll` so the exported sheet mirrors the grid's current sort exactly. */
  private buildOrderBy(
    sortBy: QueryClientsDto['sortBy'],
    sortOrder: QueryClientsDto['sortOrder'],
  ): Prisma.ClientOrderByWithRelationInput[] {
    return [
      sortBy === 'lastContactedAt' || !sortBy
        ? { lastContactedAt: { sort: sortBy ? sortOrder : 'desc', nulls: 'last' } }
        : { [sortBy]: sortOrder },
      { id: 'asc' },
    ];
  }

  async findAll(query: QueryClientsDto, user: AuthUser) {
    const { page, pageSize, sortBy, sortOrder } = query;
    const where = this.buildWhere(query, user);

    // Default: most-recently-contacted first. lastContactedAt is null for
    // clients with no contact history yet — "nulls: last" keeps those at the
    // bottom regardless of sort direction, rather than Postgres's default
    // (nulls first on desc), which would otherwise put never-contacted
    // clients at the very top.
    // `id` is appended as a tiebreaker on every sort — the primary column
    // alone routinely ties (most clients share `lastContactedAt: null`, and
    // any other sortable field can tie too), and Postgres doesn't guarantee a
    // stable order across separate paginated queries for tied rows. Without
    // it, paging (or infinite-scroll's page-by-page accumulation) can
    // silently return the same row twice or skip one.
    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: CLIENT_INCLUDE,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      data: data.map((c) => toEntity(c)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  /** Every row matching the current filters, unbounded — no `skip`/`take`. */
  async exportAll(query: ExportClientsDto, user: AuthUser): Promise<Buffer> {
    const where = this.buildWhere(query, user);
    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);
    const clients = await this.prisma.client.findMany({ where, orderBy, include: CLIENT_INCLUDE });
    return this.buildExportWorkbook(clients.map(toEntity), query.timezone);
  }

  /** An explicit row selection — scope is still re-applied server-side (defense-in-depth), so an out-of-scope id is silently dropped rather than exported. */
  async exportByIds(ids: string[], user: AuthUser, timezone?: string): Promise<Buffer> {
    const and: Prisma.ClientWhereInput[] = [{ id: { in: ids } }];
    if (isScoped(user)) and.push(clientScope(user));
    const clients = await this.prisma.client.findMany({ where: { AND: and }, include: CLIENT_INCLUDE });
    return this.buildExportWorkbook(clients.map(toEntity), timezone);
  }

  private buildExportWorkbook(clients: ClientExportRow[], timezone?: string): Promise<Buffer> {
    const tz = resolveTimeZone(timezone);
    const columns: ExportColumn[] = [
      { header: 'Company Name', key: 'companyName' },
      { header: 'Display ID', key: 'displayId' },
      { header: 'Industry', key: 'industry' },
      { header: 'Specialization', key: 'specialization' },
      { header: 'Market', key: 'market' },
      { header: 'Status', key: 'status' },
      { header: 'Quality', key: 'quality' },
      { header: 'Website', key: 'website' },
      { header: 'Last Contacted', key: 'lastContacted' },
      { header: 'Last Contacted By', key: 'lastContactedBy' },
      { header: 'Last Contact Type', key: 'lastContactType' },
      { header: 'Last Contact Notes', key: 'lastContactNotes', wrap: true },
    ];
    const rows = clients.map((c) => ({
      companyName: c.companyName,
      displayId: c.displayId,
      industry: c.industry ?? '',
      specialization: c.specialization ?? '',
      market: c.locations.join(', '),
      status: clientStatusLabels[c.status],
      quality: clientQualityLabels[c.quality],
      website: c.website ?? '',
      lastContacted: formatExportDate(c.lastContactedAt, tz),
      lastContactedBy: c.lastContactedBy ?? '',
      lastContactType: c.lastContactType ?? '',
      lastContactNotes: c.lastContactNotes ?? '',
    }));
    return buildWorkbook('Companies', columns, rows);
  }

  /**
   * Single-record access is unguarded by scope — scope only ever filters
   * `findAll`. `user` is accepted for signature symmetry with the other
   * services but unused here now.
   */
  async findOne(id: string, _user: AuthUser) {
    const client = await this.prisma.client.findUnique({ where: { id }, include: CLIENT_INCLUDE });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return toEntity(client);
  }

  async findByDisplayId(displayId: string) {
    const client = await this.prisma.client.findUnique({
      where: { displayId },
      include: CLIENT_INCLUDE,
    });
    if (!client) {
      throw new NotFoundException(`Client ${displayId} not found`);
    }
    return toEntity(client);
  }

  async create(dto: CreateClientDto, _user: AuthUser) {
    this.assertHasLocations(dto.locationIds);
    // displayId is assigned by the DB (Client_displayId_seq default).
    const client = await this.prisma.client.create({
      data: {
        ...this.toPrismaData(dto),
        locations: { create: dto.locationIds.map((locationId) => ({ locationId })) },
      },
      include: CLIENT_INCLUDE,
    });
    return toEntity(client);
  }

  async update(id: string, dto: UpdateClientDto, user: AuthUser) {
    await this.findOne(id, user);

    // A location list can be replaced, but never emptied — same reasoning as
    // on create.
    if (dto.locationIds !== undefined) {
      this.assertHasLocations(dto.locationIds);
    }

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        ...this.toPrismaData(dto),
        // Locations is a to-many join, not a scalar column — a full list
        // replace (clear then recreate) is simplest and correct here; a
        // client's market list is short.
        ...(dto.locationIds !== undefined
          ? {
              locations: {
                deleteMany: {},
                create: dto.locationIds.map((locationId) => ({ locationId })),
              },
            }
          : {}),
      },
      include: CLIENT_INCLUDE,
    });

    return toEntity(client);
  }

  /**
   * Soft-deletes the client. Cascading to its stakeholders, job research,
   * TOBs, job orders, and the submissions/placements under those job orders
   * is handled centrally by the Prisma extension's CASCADE_MAP — see
   * prisma.extensions.ts — so it fires for this call and for any other path
   * that soft-deletes a client, not just this one.
   */
  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.client.delete({ where: { id } });
  }

  /** Restores a soft-deleted client (audited as RESTORE). Children are not
   * auto-restored — recover them explicitly if needed. */
  async restore(id: string) {
    const existing = await this.base.client.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    if (!existing.deletedAt) {
      throw new BadRequestException(`Client ${id} is not deleted`);
    }
    const client = await this.prisma.client.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: CLIENT_INCLUDE,
    });
    return toEntity(client);
  }

  /**
   * Permanently deletes the client + all its children via the base client
   * (bypasses the soft-delete rewrite; cascades through the FK). Admin-only —
   * for genuine erasure. Writes a HARD_DELETE audit row first.
   */
  async purge(id: string) {
    const existing = await this.base.client.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    await this.base.auditLog.create({
      data: {
        actorId: RequestContext.getActorId() ?? null,
        action: 'HARD_DELETE',
        entityType: 'Client',
        entityId: id,
        metadata: { requestId: RequestContext.getRequestId() },
      },
    });
    return this.base.client.delete({ where: { id } });
  }
}
