import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto, SortOrder } from './dto/query-clients.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    consultantId: 'me',
    azureId: 'azure-1',
    email: 'me@example.com',
    fullName: 'Me',
    roleName: 'admin',
    isActive: true,
    permissions: new Set(),
    industryIds: [],
    specializationIds: [],
    locationIds: [],
    ...overrides,
  };
}

// industryId is a required column now, and a client must cover at least one
// Location node — so every valid DTO carries both.
function makeDto(overrides: Partial<CreateClientDto> = {}): CreateClientDto {
  return { companyName: 'Acme Corp', industryId: 'ind1', locationIds: ['loc1'], ...overrides };
}

/** The relation keys CLIENT_INCLUDE pulls in — `toEntity` destructures all of them. */
function withRelations(row: Record<string, unknown> = {}) {
  return { industry: null, specialization: null, locations: [], stakeholders: [], ...row };
}

/** A location node as CLIENT_INCLUDE returns it, on the client's own market set. */
function marketNode(id: string, name: string, ancestorIds: string[]) {
  return { locationId: id, location: { name, ancestorIds } };
}

const baseQuery: QueryClientsDto = {
  page: 1,
  pageSize: 20,
  sortOrder: SortOrder.asc,
};

describe('ClientsService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({ id: 'cl1', displayId: 'Client-0101', companyName: 'Acme Corp' }),
    );
    const prisma = { client: { create } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new ClientsService(prisma, base);

    const result = await service.create(makeDto(), makeUser());

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toEqual({
      id: 'cl1',
      displayId: 'Client-0101',
      companyName: 'Acme Corp',
      industry: null,
      specialization: null,
      locations: [],
      locationIds: [],
      lastContactType: null,
      lastContactCategory: null,
      lastContactNotes: null,
      lastContactedBy: null,
    });
  });

  it('nests locationIds as a create on the join relation', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'cl1' }));
    const prisma = { client: { create } } as unknown as ExtendedPrismaClient;
    const service = new ClientsService(prisma, {} as unknown as PrismaService);

    await service.create(makeDto({ locationIds: ['syd', 'bne'] }), makeUser());

    expect(create.mock.calls[0][0].data.locations).toEqual({
      create: [{ locationId: 'syd' }, { locationId: 'bne' }],
    });
    // the relation write replaces the raw id list, it isn't also passed as a column
    expect(create.mock.calls[0][0].data).not.toHaveProperty('locationIds');
  });

  // The schema can't express "non-empty relation", so this is enforced in the
  // service: without a location the client falls out of every consultant's
  // patch on the location arm of the scope resolver.
  it('rejects a client with no locations at all', async () => {
    const create = jest.fn();
    const prisma = { client: { create } } as unknown as ExtendedPrismaClient;
    const service = new ClientsService(prisma, {} as unknown as PrismaService);

    await expect(service.create(makeDto({ locationIds: [] }), makeUser())).rejects.toMatchObject({
      response: { code: 'CLIENT_LOCATION_REQUIRED' },
    });
    expect(create).not.toHaveBeenCalled();
  });
});

// Cascading to stakeholders/job orders/research/TOBs (and their own
// submissions/placements) is no longer this service's job — it's handled
// centrally by the Prisma extension's CASCADE_MAP for any delete path, not
// just this one. See prisma.extensions.spec.ts for that coverage.
describe('ClientsService.remove', () => {
  it('checks existence, then hands off to a plain delete', async () => {
    const prisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue(withRelations({ id: 'cl1', companyName: 'Acme' })),
        delete: jest.fn().mockResolvedValue({ id: 'cl1' }),
      },
    };
    const service = new ClientsService(
      prisma as unknown as ExtendedPrismaClient,
      {} as unknown as PrismaService,
    );

    await service.remove('cl1', makeUser());

    expect(prisma.client.findUnique).toHaveBeenCalled();
    expect(prisma.client.delete).toHaveBeenCalledWith({ where: { id: 'cl1' } });
  });
});

// Regression coverage for the null-vs-undefined bug: the frontend once sent
// `?? undefined` for cleared fields, which JSON.stringify drops from the
// request body entirely, so a "clear this field" edit silently no-op'd while
// still reporting success. That was a frontend bug, not a service one — this
// pins down the service's side of the contract (it must pass `null` straight
// through, unmangled) so a future refactor here can't reintroduce the same
// class of bug from the other direction.
describe('ClientsService.update', () => {
  function makeService(existing: unknown = withRelations({ id: 'cl1', industryId: 'ind1' })) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'cl1' }));
    const prisma = {
      client: { findUnique, update },
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), update };
  }

  it('passes null straight through for cleared nullable fields, instead of stripping them', async () => {
    const { service, update } = makeService();
    // Generated type omits null (Prisma/class-validator accept it at
    // runtime) — same gap the frontend casts around.
    const dto = {
      specializationId: null,
      website: null,
      generalDescription: null,
    } as unknown as UpdateClientDto;

    await service.update('cl1', dto, makeUser());

    const savedData = update.mock.calls[0][0].data;
    expect(savedData.specializationId).toBeNull();
    expect(savedData.website).toBeNull();
    expect(savedData.generalDescription).toBeNull();
  });

  it('replaces the whole location set rather than merging into it', async () => {
    const { service, update } = makeService();
    await service.update('cl1', { locationIds: ['mel'] }, makeUser());

    expect(update.mock.calls[0][0].data.locations).toEqual({
      deleteMany: {},
      create: [{ locationId: 'mel' }],
    });
  });

  it('rejects emptying the location set', async () => {
    const { service, update } = makeService();
    await expect(service.update('cl1', { locationIds: [] }, makeUser())).rejects.toMatchObject({
      response: { code: 'CLIENT_LOCATION_REQUIRED' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('throws when the client does not exist', async () => {
    const { service } = makeService(null);
    await expect(
      service.update('missing', { companyName: 'X' }, makeUser()),
    ).rejects.toThrow('Client missing not found');
  });
});

describe('ClientsService.findAll — filters', () => {
  function makeService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(rows.length);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), findMany };
  }

  it('does not filter at all when no filters are given', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser());
    expect(findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  // TOBs are a one-to-many table now, so "has terms on file" is the existence
  // of any Tob row rather than the old `tobSigned` boolean column.
  it('maps hasTob onto the existence of a Tob row', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, hasTob: true }, makeUser());
    expect(findMany.mock.calls[0][0].where.tobs).toEqual({ some: {} });

    await service.findAll({ ...baseQuery, hasTob: false }, makeUser());
    expect(findMany.mock.calls[1][0].where.tobs).toEqual({ none: {} });
  });

  it('filters by industryIds/specializationIds as exact FK matches, distinct from the free-text industry/specialization filters', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, industryIds: ['ind1', 'ind2'] }, makeUser());
    expect(findMany.mock.calls[0][0].where.industryId).toEqual({ in: ['ind1', 'ind2'] });

    await service.findAll({ ...baseQuery, specializationIds: ['spec1'] }, makeUser());
    expect(findMany.mock.calls[1][0].where.specializationId).toEqual({ in: ['spec1'] });
  });

  // A client carries a *set* of locations at mixed granularity, so both
  // location filters go through the join.
  it('matches locationIds against any market node ancestor path', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, locationIds: ['nsw'] }, makeUser());
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } },
    });
  });

  it('matches a free-text location against any market node name', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, location: 'Sydney' }, makeUser());
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      locations: { some: { location: { name: { contains: 'Sydney', mode: 'insensitive' } } } },
    });
  });
});

// A consultant's visible companies are decided by `clientScope` alone — a
// pure filter, three arms OR-ed (industry, own market, job-order membership).
// There is no ownership arm and no "own book" AND anymore.
describe('ClientsService.findAll — consultant role scoping', () => {
  function makeService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(rows.length);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), findMany };
  }

  it('does not restrict non-consultant roles (e.g. manager)', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser({ roleName: 'manager', consultantId: 'mgr-1' }));
    expect(findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it("AND's the scope with the free-text search instead of clobbering it", async () => {
    const { service, findMany } = makeService();
    await service.findAll(
      { ...baseQuery, q: 'acme' },
      makeUser({
        roleName: 'consultant',
        consultantId: 'cons-me',
        industryIds: ['ind1', 'ind2'],
        locationIds: ['nsw'],
      }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: expect.any(Array) }, // the q search
      {
        OR: [
          { industryId: { in: ['ind1', 'ind2'] } },
          { locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
          { jobOrders: { some: { deletedAt: null, consultants: { some: { consultantId: 'cons-me' } } } } },
        ],
      },
    ]);
  });

  // Zero grants means "not configured", never "sees everything" — but the
  // job-order-membership arm still applies even with no industry/location
  // grants at all, so a freshly onboarded consultant already added to a job
  // order can still reach that job order's client.
  it('emits an unmatchable industry/location arm but keeps the job-order arm for a consultant with no grants', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser({ roleName: 'consultant', consultantId: 'cons-me' }));
    const scope = findMany.mock.calls[0][0].where.AND[0];
    expect(scope.OR).toEqual([
      { industryId: { in: [] } },
      { locations: { some: { location: { ancestorIds: { hasSome: [] } } } } },
      { jobOrders: { some: { deletedAt: null, consultants: { some: { consultantId: 'cons-me' } } } } },
    ]);
  });

  it('does not add a scope for non-consultant roles', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, q: 'acme' }, makeUser({ roleName: 'admin' }));
    expect(findMany.mock.calls[0][0].where.AND).toEqual([{ OR: expect.any(Array) }]);
  });
});

// findOne/update/remove no longer gate on scope at all — scope is a list
// filter only now (see common/scope.ts). A direct fetch by id always
// succeeds regardless of the caller's industry/location grants; reaching an
// out-of-scope client this way is expected, not a bug, since job-order
// membership is a deliberate escape hatch that findOne has no way to check
// against (it isn't tied to a specific job order at all).
describe('ClientsService.findOne', () => {
  function makeService(client: unknown) {
    const findUnique = jest.fn().mockResolvedValue(client);
    const prisma = { client: { findUnique } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base) };
  }

  it('returns the record for a scoped consultant even when no arm matches', async () => {
    const { service } = makeService(
      withRelations({
        id: 'cl1',
        industryId: 'finance',
        locations: [marketNode('perth', 'Perth', ['perth', 'wa', 'au'])],
      }),
    );
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });

  it('throws NotFound when the client does not exist, for every role', async () => {
    const { service } = makeService(null);
    await expect(
      service.findOne('missing', makeUser({ roleName: 'consultant' })),
    ).rejects.toThrow('Client missing not found');
  });
});
