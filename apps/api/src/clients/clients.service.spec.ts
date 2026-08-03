import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientQualityFilter, ClientStatusFilter, QueryClientsDto, SortOrder } from './dto/query-clients.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';
import { grantsMock } from '../common/grants.testing';

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

/** A live stakeholder whose own coverage reaches the given ancestor paths. */
function stakeholderCovering(...ancestorIds: string[][]) {
  return { coverage: ancestorIds.map((ids) => ({ location: { ancestorIds: ids } })), contactHistory: [] };
}

const baseQuery: QueryClientsDto = {
  page: 1,
  pageSize: 20,
  sortOrder: SortOrder.asc,
  status: ClientStatusFilter.ALL,
  quality: ClientQualityFilter.ALL,
};

describe('ClientsService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({ id: 'cl1', displayId: 'Client-0101', companyName: 'Acme Corp' }),
    );
    const prisma = { client: { create } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new ClientsService(prisma, base);

    const result = await service.create(makeDto());

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

    await service.create(makeDto({ locationIds: ['syd', 'bne'] }));

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

    await expect(service.create(makeDto({ locationIds: [] }))).rejects.toMatchObject({
      response: { code: 'CLIENT_LOCATION_REQUIRED' },
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ClientsService.remove (cascade soft-delete)', () => {
  it('cascades to job orders + their submissions/placements, stakeholders, research and TOBs', async () => {
    const prisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue(withRelations({ id: 'cl1', companyName: 'Acme' })),
        delete: jest.fn().mockResolvedValue({ id: 'cl1' }),
      },
      jobOrder: {
        findMany: jest.fn().mockResolvedValue([{ id: 'j1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      candidateSubmission: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      placement: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stakeholder: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      clientJobResearch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tob: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new ClientsService(
      prisma as unknown as ExtendedPrismaClient,
      {} as unknown as PrismaService,
    );

    await service.remove('cl1', makeUser());

    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['s1'] } },
    });
    expect(prisma.candidateSubmission.deleteMany).toHaveBeenCalledWith({
      where: { jobOrderId: { in: ['j1'] } },
    });
    expect(prisma.jobOrder.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.stakeholder.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.clientJobResearch.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.tob.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.client.delete).toHaveBeenCalledWith({ where: { id: 'cl1' } });
    // client (parent) removed after its job orders
    expect(prisma.client.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.jobOrder.deleteMany.mock.invocationCallOrder[0],
    );
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
    // An industry or locationIds edit runs the auto-clear afterwards, which
    // re-reads the client and walks its job orders — mocked here so these
    // tests can stay focused on the write itself. The row has no consultant,
    // so nothing is ever cleared.
    const prisma = {
      client: { findUnique, update, findUniqueOrThrow: findUnique },
      jobOrder: { findMany: jest.fn().mockResolvedValue([]) },
      ...grantsMock(),
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), update };
  }

  it('passes null straight through for cleared nullable fields, instead of stripping them', async () => {
    const { service, update } = makeService();
    // Generated type omits null (Prisma/class-validator accept it at
    // runtime) — same gap the frontend casts around.
    const dto = {
      consultantId: null,
      specializationId: null,
      website: null,
      generalDescription: null,
    } as unknown as UpdateClientDto;

    await service.update('cl1', dto, makeUser());

    const savedData = update.mock.calls[0][0].data;
    expect(savedData.consultantId).toBeNull();
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

// A consultant can reassign a company to a different consultant, but can't
// clear the assignment entirely — orphaning it would (combined with the
// consultant-only scoping in `findAll`) drop it out of anyone's book.
describe('ClientsService.update — consultant cannot unassign', () => {
  function makeService(existing: unknown = withRelations({ id: 'cl1', industryId: 'ind1' })) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'cl1' }));
    // The assignment guard needs grants to check a candidate consultantId
    // against — holds ind1, so tests reassigning to cons-2 aren't blocked by it.
    const prisma = {
      client: { findUnique, update },
      ...grantsMock({ industryIds: ['ind1'] }),
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), update };
  }

  it('rejects a consultant clearing consultantId with null', async () => {
    const { service } = makeService();
    await expect(
      service.update(
        'cl1',
        { consultantId: null } as unknown as UpdateClientDto,
        makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
      ),
    ).rejects.toThrow('Consultants cannot unassign a company from a consultant.');
  });

  it('rejects a consultant clearing consultantId with the "" sentinel', async () => {
    const { service } = makeService();
    await expect(
      service.update(
        'cl1',
        { consultantId: '' } as unknown as UpdateClientDto,
        makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
      ),
    ).rejects.toThrow('Consultants cannot unassign a company from a consultant.');
  });

  it('allows a consultant reassigning to a different consultant', async () => {
    const { service, update } = makeService();
    await service.update(
      'cl1',
      { consultantId: 'cons-2' },
      makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('allows a consultant updating other fields without touching consultantId', async () => {
    const { service, update } = makeService();
    await service.update('cl1', { companyName: 'Acme 2' }, makeUser({ roleName: 'consultant', industryIds: ['ind1'] }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('allows an admin to clear consultantId', async () => {
    const { service, update } = makeService();
    await service.update(
      'cl1',
      { consultantId: null } as unknown as UpdateClientDto,
      makeUser({ roleName: 'admin' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});

// Regression coverage for the '' (Unassigned) sentinel bug: `findAll` used to
// check `if (query.consultantId)`, which is falsy for '', so filtering by
// "Unassigned" silently returned every client instead of just the unassigned
// ones.
describe('ClientsService.findAll — filters', () => {
  function makeService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(rows.length);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), findMany };
  }

  it('does not filter by consultant when consultantId is omitted', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser());
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('consultantId');
  });

  it('maps the "" Unassigned sentinel to a null FK filter, not a no-op', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, consultantId: '' }, makeUser());
    expect(findMany.mock.calls[0][0].where.consultantId).toBeNull();
  });

  it('filters by the given consultant id', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, consultantId: 'cons-1' }, makeUser());
    expect(findMany.mock.calls[0][0].where.consultantId).toBe('cons-1');
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

// A consultant must only ever see their own book of companies. This is
// enforced server-side (not just hidden in the UI) because business logic
// guarantees a consultant is never assigned more than ~20 companies — the
// list never needs pagination for that role, but only if it's actually
// scoped to them.
describe('ClientsService.findAll — consultant role scoping', () => {
  function makeService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(rows.length);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), findMany };
  }

  // A consultant's client list is decided by `clientScope` alone. It used to
  // also AND on `consultantId = me`, which swallowed every other arm and left
  // the list empty for anyone with no assigned accounts — the whole scope
  // function was dead code behind it.
  it('does not force the filter to the caller, so the scope arms can apply', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser({ roleName: 'consultant', consultantId: 'cons-me' }));
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('consultantId');
  });

  // Safe to honour now: the scope is AND-ed on top, so filtering *by* another
  // consultant can only narrow what this caller could already see.
  it('honours a caller-supplied consultantId as a filter, still under scope', async () => {
    const { service, findMany } = makeService();
    await service.findAll(
      { ...baseQuery, consultantId: 'someone-elses-id' },
      makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['ind1'] }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.consultantId).toBe('someone-elses-id');
    expect(where.AND).toContainEqual(expect.objectContaining({ OR: expect.any(Array) }));
  });

  it('does not restrict non-consultant roles (e.g. manager)', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser({ roleName: 'manager', consultantId: 'mgr-1' }));
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('consultantId');
  });

  // visible = (industry AND specialization) OR location — the two arms are
  // OR-ed, and sit on top of the "own book only" ownership rule above.
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
          { consultantId: 'cons-me' }, // ownership wins outright
          { industryId: { in: ['ind1', 'ind2'] } },
          { locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
          // third arm — reachable through a contact who covers my patch
          {
            stakeholders: {
              some: {
                deletedAt: null,
                coverage: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } },
              },
            },
          },
        ],
      },
    ]);
  });

  // A removed contact must stop granting visibility to their employer. The
  // extended client's soft-delete rewrite only intercepts top-level calls,
  // not this nested relation filter, so the arm carries its own guard.
  it('excludes soft-deleted stakeholders from the third arm', async () => {
    const { service, findMany } = makeService();
    await service.findAll(
      { ...baseQuery },
      makeUser({ roleName: 'consultant', consultantId: 'cons-me', locationIds: ['nsw'] }),
    );
    const scope = findMany.mock.calls[0][0].where.AND.find((c: Record<string, unknown>) => 'OR' in c);
    expect(scope.OR[3].stakeholders.some.deletedAt).toBeNull();
  });

  // Zero grants means "not configured", never "sees everything" — but an
  // explicit assignment is a specific row, not a wildcard, so an unconfigured
  // consultant still keeps their own book instead of being locked out of it.
  it('falls back to just their own book for a consultant with no grants at all', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser({ roleName: 'consultant', consultantId: 'cons-me' }));
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ consultantId: 'cons-me' });
    expect(findMany.mock.calls[0][0].where.AND).not.toContainEqual({ id: { in: [] } });
  });

  it('does not add a scope for non-consultant roles', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, q: 'acme' }, makeUser({ roleName: 'admin' }));
    expect(findMany.mock.calls[0][0].where.AND).toEqual([{ OR: expect.any(Array) }]);
  });
});

describe('ClientsService.findOne — job scope', () => {
  function makeService(client: unknown) {
    const findUnique = jest.fn().mockResolvedValue(client);
    const prisma = { client: { findUnique } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base) };
  }

  it('rejects a scoped consultant when no arm matches', async () => {
    const { service } = makeService(
      withRelations({
        id: 'cl1',
        industryId: 'finance',
        locations: [marketNode('perth', 'Perth', ['perth', 'wa', 'au'])],
        stakeholders: [stakeholderCovering(['perth', 'wa', 'au'])],
      }),
    );
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('allows a scoped consultant on an industry match alone', async () => {
    const { service } = makeService(withRelations({ id: 'cl1', industryId: 'tech' }));
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });

  // The location arm resolves upward: a STATE grant reaches a client whose
  // market includes a city inside it, because the state is on that city's
  // ancestor path.
  it('allows a scoped consultant on a location match alone, via an ancestor', async () => {
    const { service } = makeService(
      withRelations({
        id: 'cl1',
        industryId: 'finance',
        locations: [marketNode('sydney', 'Sydney', ['sydney', 'nsw', 'au'])],
      }),
    );
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });

  // The third arm, and the reason it exists: this Brisbane company is out of
  // scope on both its own industry and its own market, but its national
  // account manager covers Sydney — so the contact was already reachable, and
  // the company they work for must be too.
  it("allows a scoped consultant on a stakeholder's own coverage alone", async () => {
    const { service } = makeService(
      withRelations({
        id: 'cl1',
        industryId: 'finance',
        locations: [marketNode('brisbane', 'Brisbane', ['brisbane', 'qld', 'au'])],
        stakeholders: [stakeholderCovering(['sydney', 'nsw', 'au'])],
      }),
    );
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });

  // The arm asks "is there *any* live contact covering my patch", so deleting
  // one of several changes nothing — CLIENT_INCLUDE filters the deleted one
  // out and the remaining contacts still satisfy it. Access only lapses when
  // the last covering contact goes (the case below).
  it('stays visible when one of several covering stakeholders is deleted', async () => {
    const { service } = makeService(
      withRelations({
        id: 'cl1',
        industryId: 'finance',
        locations: [marketNode('brisbane', 'Brisbane', ['brisbane', 'qld', 'au'])],
        // the deleted one is already filtered out by the include; these are what's left
        stakeholders: [
          stakeholderCovering(['sydney', 'nsw', 'au']),
          stakeholderCovering(['newcastle', 'nsw', 'au']),
        ],
      }),
    );
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });

  // Ownership short-circuits every arm: an account someone was deliberately
  // handed stays theirs to open even after its industry is retagged out from
  // under them, or before their grants are configured at all.
  it('allows the owning consultant through regardless of every other arm', async () => {
    const { service } = makeService(
      withRelations({
        id: 'cl1',
        industryId: 'finance',
        consultantId: 'cons-me',
        locations: [marketNode('perth', 'Perth', ['perth', 'wa', 'au'])],
      }),
    );
    await expect(
      service.findOne(
        'cl1',
        makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['tech'], locationIds: ['nsw'] }),
      ),
    ).resolves.toMatchObject({ id: 'cl1' });
  });

  it("does not let one consultant through on another's assignment", async () => {
    const { service } = makeService(
      withRelations({ id: 'cl1', industryId: 'finance', consultantId: 'someone-else' }),
    );
    await expect(
      service.findOne(
        'cl1',
        makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['tech'] }),
      ),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  // Both null must not read as "same owner" — an unassigned client is nobody's.
  it('does not treat an unassigned client as owned', async () => {
    const { service } = makeService(
      withRelations({ id: 'cl1', industryId: 'finance', consultantId: null }),
    );
    await expect(
      service.findOne(
        'cl1',
        makeUser({ roleName: 'consultant', consultantId: null as unknown as string, industryIds: ['tech'] }),
      ),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('lapses only once the last covering stakeholder is gone', async () => {
    const { service } = makeService(
      withRelations({
        id: 'cl1',
        industryId: 'finance',
        locations: [marketNode('brisbane', 'Brisbane', ['brisbane', 'qld', 'au'])],
        // the sole NSW contact was deleted, so the include returns nobody
        stakeholders: [],
      }),
    );
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('never restricts non-consultant roles, regardless of industry', async () => {
    const { service } = makeService(withRelations({ id: 'cl1', industryId: 'finance' }));
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'admin' })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });
});

describe('ClientsService.create — assignment guard (industry OR location)', () => {
  function makeService(grants: Parameters<typeof grantsMock>[0] = {}) {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'cl1' }));
    const prisma = { client: { create }, ...grantsMock(grants) } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), create };
  }

  it('allows creating with no consultant assigned at all', async () => {
    const { service, create } = makeService();
    await service.create(makeDto());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects assigning a consultant who covers neither the industry nor the market', async () => {
    const { service, create } = makeService(); // holds nothing
    await expect(
      service.create(makeDto({ industryId: 'ind1', consultantId: 'cons-1' })),
    ).rejects.toMatchObject({ response: { code: 'CONSULTANT_SCOPE_MISMATCH' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('allows assigning a consultant whose industry matches', async () => {
    const { service, create } = makeService({ industryIds: ['ind1'] });
    await service.create(makeDto({ industryId: 'ind1', consultantId: 'cons-1' }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  // The behaviour change: a consultant whose industry holds nothing can still
  // be given an account in a market they cover.
  it('allows assigning a consultant on location alone', async () => {
    const { service, create } = makeService({ locationIds: ['au'], locationCovers: true });
    await service.create(
      makeDto({ industryId: 'ind1', consultantId: 'cons-1', locationIds: ['syd'] }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("checks the client's own markets, not just its industry", async () => {
    const { service } = makeService({ locationIds: ['au'], locationCovers: true });
    const prismaLocation = (service as unknown as { prisma: { location: { count: jest.Mock } } }).prisma
      .location;
    await service.create(
      makeDto({ industryId: 'ind1', consultantId: 'cons-1', locationIds: ['syd', 'bne'] }),
    );
    expect(prismaLocation.count).toHaveBeenCalledWith({
      where: { id: { in: ['syd', 'bne'] }, ancestorIds: { hasSome: ['au'] } },
    });
  });
});

describe('ClientsService.update — bidirectional auto-clear', () => {
  /**
   * `clearMismatchedClientAssignment` re-reads the client rather than taking
   * the new industry as an argument, so the second `findUnique` returns the
   * post-update row (industry + markets) that the coverage check runs against.
   */
  function makeService(grants: Parameters<typeof grantsMock>[0] = {}) {
    const findUnique = jest
      .fn()
      // findOne (existing, before the update)
      .mockResolvedValueOnce(withRelations({ id: 'cl1', industryId: 'ind1', consultantId: 'cons-1' }))
      // the auto-clear's own re-read of the persisted row
      .mockResolvedValueOnce({ consultantId: 'cons-1', industryId: 'ind2', locations: [{ locationId: 'syd' }] })
      // final re-fetch for the response
      .mockResolvedValueOnce(withRelations({ id: 'cl1', industryId: 'ind2', consultantId: null }));
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'cl1', industryId: 'ind2' }));
    const prisma = {
      client: { findUnique, update, findUniqueOrThrow: findUnique },
      jobOrder: { findMany: jest.fn().mockResolvedValue([]) },
      ...grantsMock(grants),
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), update };
  }

  it('clears a now-uncovered consultant when the industry changes without touching consultantId', async () => {
    const { service, update } = makeService(); // cons-1 covers neither ind2 nor syd
    const result = await service.update(
      'cl1',
      { industryId: 'ind2' } as unknown as UpdateClientDto,
      makeUser({ roleName: 'admin' }),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl1' }, data: { industryId: 'ind2' } }),
    );
    // The stranded consultant got auto-cleared as a second, separate write.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl1' }, data: { consultantId: null } }),
    );
    expect(update).toHaveBeenCalledTimes(2);
    expect(result.consultantId).toBeNull();
  });

  it('does not touch the consultant when the new industry still covers them', async () => {
    const { service, update } = makeService({ industryIds: ['ind2'] });
    await service.update(
      'cl1',
      { industryId: 'ind2' } as unknown as UpdateClientDto,
      makeUser({ roleName: 'admin' }),
    );
    // Still covered — only the one industryId write, no consultant clear.
    expect(update).toHaveBeenCalledTimes(1);
  });

  // Losing the industry no longer strands a record the owner's patch holds.
  it('does not touch the consultant when only their location still covers it', async () => {
    const { service, update } = makeService({ locationIds: ['au'], locationCovers: true });
    await service.update(
      'cl1',
      { industryId: 'ind2' } as unknown as UpdateClientDto,
      makeUser({ roleName: 'admin' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  // Markets are an ownership arm now, so replacing them has to re-check too.
  it('runs the auto-clear when only the location set changed', async () => {
    const { service, update } = makeService();
    await service.update(
      'cl1',
      { locationIds: ['syd'] } as unknown as UpdateClientDto,
      makeUser({ roleName: 'admin' }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl1' }, data: { consultantId: null } }),
    );
  });
});

describe('ClientsService — consultantId redaction for the consultant role', () => {
  const row = withRelations({ id: 'cl1', consultantId: 'cons-1', industryId: 'ind1' });

  it('redacts consultantId to null in findAll for the consultant role', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new ClientsService(prisma, {} as unknown as PrismaService);

    const result = await service.findAll(
      { ...baseQuery },
      makeUser({ roleName: 'consultant', consultantId: 'cons-1', industryIds: ['ind1'] }),
    );

    expect(result.data[0].consultantId).toBeNull();
  });

  it('does not redact consultantId for non-consultant roles', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new ClientsService(prisma, {} as unknown as PrismaService);

    const result = await service.findAll({ ...baseQuery }, makeUser({ roleName: 'admin' }));

    expect(result.data[0].consultantId).toBe('cons-1');
  });

  it('redacts consultantId to null in findOne for the consultant role', async () => {
    const findUnique = jest.fn().mockResolvedValue(row);
    const prisma = { client: { findUnique } } as unknown as ExtendedPrismaClient;
    const service = new ClientsService(prisma, {} as unknown as PrismaService);

    const result = await service.findOne(
      'cl1',
      makeUser({ roleName: 'consultant', consultantId: 'cons-1', industryIds: ['ind1'] }),
    );
    expect(result.consultantId).toBeNull();
  });
});
