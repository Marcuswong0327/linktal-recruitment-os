import { JobOrdersService } from './job-orders.service';
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

/** The relation keys JOB_ORDER_INCLUDE pulls in — `toEntity` destructures all of them. */
function withRelations(row: Record<string, unknown> = {}) {
  return {
    client: null,
    jobTitle: null,
    jobRoleType: null,
    location: null,
    submissions: [],
    ...row,
  };
}

describe('JobOrdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({ id: 'j1', displayId: 'JO-0069', jobTitle: { name: 'Production Manager' } }),
    );
    const prisma = { jobOrder: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    const result = await service.create({ clientId: 'cl1', jobTitleId: 'jt-1' }, makeUser());

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toMatchObject({ id: 'j1', displayId: 'JO-0069', jobTitle: 'Production Manager' });
    expect(result.pipelineSubmissions).toEqual([]);
  });

  // Unlike Stakeholder, a job order never grows the JobTitle catalog on the
  // way past — it takes catalog ids only, and a title new to the catalog is
  // created through /job-titles first.
  it('passes the catalog ids straight through without touching the catalog', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'j1' }));
    const prisma = { jobOrder: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1', jobRoleTypeId: 'jrt-1' }, makeUser());

    expect(create.mock.calls[0][0].data).toMatchObject({ jobTitleId: 'jt-1', jobRoleTypeId: 'jrt-1' });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('jobTitle');
  });
});

// Cascading to submissions (and their placements) is no longer this service's
// job — it's handled centrally by the Prisma extension's CASCADE_MAP for any
// delete path, not just this one. See prisma.extensions.spec.ts.
describe('JobOrdersService.remove', () => {
  it('checks scope, then hands off to a plain delete', async () => {
    const prisma = {
      jobOrder: {
        findUnique: jest.fn().mockResolvedValue(withRelations({ id: 'j1' })),
        delete: jest.fn().mockResolvedValue({ id: 'j1' }),
      },
    };
    const service = new JobOrdersService(prisma as unknown as ExtendedPrismaClient);

    await service.remove('j1', makeUser());

    expect(prisma.jobOrder.findUnique).toHaveBeenCalled();
    expect(prisma.jobOrder.delete).toHaveBeenCalledWith({ where: { id: 'j1' } });
  });
});

describe('JobOrdersService.findAll — filters', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { jobOrder: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { findMany, service: new JobOrdersService(prisma) };
  }

  const baseQuery = { page: 1, pageSize: 20, sortOrder: 'asc' } as unknown as Record<string, unknown>;

  // The old city/suburb columns are gone: a selected node covers everything
  // beneath it, resolved through the record's denormalized ancestor path
  // rather than by expanding the selection downward.
  it('matches locationIds against the job order location ancestor path', async () => {
    const { findMany, service } = setup();
    await service.findAll({ ...baseQuery, locationIds: ['qld'] } as never, makeUser());

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      location: { ancestorIds: { hasSome: ['qld'] } },
    });
  });

  it("matches a free-text location against the node's own name", async () => {
    const { findMany, service } = setup();
    await service.findAll({ ...baseQuery, location: 'Brisbane' } as never, makeUser());

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      location: { name: { contains: 'Brisbane', mode: 'insensitive' } },
    });
  });

  it('searches the job title through the relation, not a scalar column', async () => {
    const { findMany, service } = setup();
    await service.findAll({ ...baseQuery, q: 'manager' } as never, makeUser());

    const orClause = findMany.mock.calls[0][0].where.AND.find(
      (c: Record<string, unknown>) => 'OR' in c,
    );
    expect(orClause.OR).toContainEqual({
      jobTitle: { name: { contains: 'manager', mode: 'insensitive' } },
    });
  });

  it('overlaps the salary band against the queried bounds', async () => {
    const { findMany, service } = setup();
    await service.findAll({ ...baseQuery, salaryMin: 100000, salaryMax: 150000 } as never, makeUser());

    const where = findMany.mock.calls[0][0].where;
    expect(where.salaryMax).toEqual({ gte: 100000 });
    expect(where.salaryMin).toEqual({ lte: 150000 });
  });
});

// visible = (industry via parent Client) OR location — the two arms are
// OR-ed, and for job orders they sit on top of the pre-existing "own book
// only" ownership rule.
describe('JobOrdersService.findAll — scope', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { jobOrder: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { findMany, service: new JobOrdersService(prisma) };
  }

  const baseQuery = { page: 1, pageSize: 20, sortOrder: 'asc' } as unknown as Record<string, unknown>;

  it('ANDs the scope (industry via parent Client, OR location) with the free-text search', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      { ...baseQuery, q: 'manager' } as never,
      makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['ind1'], locationIds: ['qld'] }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: expect.any(Array) },
      {
        OR: [
          { consultantId: 'cons-me' }, // an assigned job order is always mine to see
          { client: { industryId: { in: ['ind1'] } } },
          { location: { ancestorIds: { hasSome: ['qld'] } } },
        ],
      },
    ]);
    // `jobOrderScope` is the only thing narrowing the list. It used to also
    // AND on `consultantId = me`, which swallowed the industry and location
    // arms entirely — a consultant saw their own book and nothing else.
    expect(where).not.toHaveProperty('consultantId');
  });

  // Zero grants means "not configured", never "sees everything" — but an
  // assignment is a specific row rather than a wildcard, so an unconfigured
  // consultant keeps whatever has been handed to them.
  it('falls back to just their assigned job orders when there are no grants at all', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery as never,
      makeUser({ roleName: 'consultant', consultantId: 'cons-me' }),
    );

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ consultantId: 'cons-me' });
    expect(findMany.mock.calls[0][0].where.AND).not.toContainEqual({ id: { in: [] } });
  });

  it('does not scope non-consultant roles', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery as never, makeUser({ roleName: 'manager' }));
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
  });
});

describe('JobOrdersService.findOne — job scope', () => {
  function makeService(jobOrder: unknown) {
    const findUnique = jest.fn().mockResolvedValue(jobOrder);
    const prisma = { jobOrder: { findUnique } } as unknown as ExtendedPrismaClient;
    return { service: new JobOrdersService(prisma) };
  }

  it('rejects a scoped consultant when neither arm matches', async () => {
    const { service } = makeService(
      withRelations({
        id: 'j1',
        client: { industryId: 'finance' },
        location: { name: 'Perth', level: 'CITY', ancestorIds: ['perth', 'wa', 'au'] },
      }),
    );
    await expect(
      service.findOne('j1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['qld'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  // Ownership short-circuits both arms, same as Client and Candidate.
  it('allows the owning consultant through regardless of both arms', async () => {
    const { service } = makeService(
      withRelations({
        id: 'j1',
        consultantId: 'cons-me',
        client: { industryId: 'finance' },
        location: { name: 'Perth', level: 'CITY', ancestorIds: ['perth', 'wa', 'au'] },
      }),
    );
    await expect(
      service.findOne(
        'j1',
        makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['tech'], locationIds: ['qld'] }),
      ),
    ).resolves.toMatchObject({ id: 'j1' });
  });

  it("does not let one consultant through on another's assignment", async () => {
    const { service } = makeService(
      withRelations({ id: 'j1', consultantId: 'someone-else', client: { industryId: 'finance' } }),
    );
    await expect(
      service.findOne(
        'j1',
        makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['tech'] }),
      ),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it("allows a scoped consultant on the parent Client's industry alone", async () => {
    const { service } = makeService(withRelations({ id: 'j1', client: { industryId: 'tech' } }));
    await expect(
      service.findOne('j1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).resolves.toMatchObject({ id: 'j1' });
  });

  // The location arm resolves upward: a STATE grant reaches a job order
  // pinned to a city inside it, because the state is on the city's ancestor
  // path.
  it('allows a scoped consultant on a location match alone, via an ancestor', async () => {
    const { service } = makeService(
      withRelations({
        id: 'j1',
        client: { industryId: 'finance' },
        location: { name: 'Brisbane', level: 'CITY', ancestorIds: ['brisbane', 'qld', 'au'] },
      }),
    );
    await expect(
      service.findOne('j1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['qld'] })),
    ).resolves.toMatchObject({ id: 'j1' });
  });
});

describe('JobOrdersService.create — assignment guard (industry OR location)', () => {
  function makeService(
    grants: Parameters<typeof grantsMock>[0] = {},
    clientRow: unknown = { industryId: 'ind1' },
  ) {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'j1' }));
    const prisma = {
      jobOrder: { create },
      ...grantsMock(grants),
      client: { findUnique: jest.fn().mockResolvedValue(clientRow) },
    } as unknown as ExtendedPrismaClient;
    return { service: new JobOrdersService(prisma), create };
  }

  it('rejects assigning a consultant who covers neither the client industry nor the location', async () => {
    const { service, create } = makeService();
    await expect(
      service.create(
        { clientId: 'cl1', jobTitleId: 'jt-1', consultantId: 'cons-1' },
        makeUser({ roleName: 'consultant' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'CONSULTANT_SCOPE_MISMATCH' } });
    expect(create).not.toHaveBeenCalled();
  });

  it("allows assigning a consultant whose industry matches the client's", async () => {
    const { service, create } = makeService({ industryIds: ['ind1'] });
    await service.create(
      { clientId: 'cl1', jobTitleId: 'jt-1', consultantId: 'cons-1' },
      makeUser({ roleName: 'consultant' }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  // A job order carries its own location — matching it is enough even when the
  // client's industry sits outside the consultant's grants.
  it("allows assigning on the job order's own location alone", async () => {
    const { service, create } = makeService({ locationIds: ['au'], locationCovers: true });
    await service.create(
      { clientId: 'cl1', jobTitleId: 'jt-1', consultantId: 'cons-1', locationId: 'syd' },
      makeUser({ roleName: 'consultant' }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips the guard entirely when no consultant is being assigned', async () => {
    const { service, create } = makeService();
    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1' }, makeUser());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lets admin assign a consultant who covers neither the client industry nor the location', async () => {
    const { service, create } = makeService();
    await service.create(
      { clientId: 'cl1', jobTitleId: 'jt-1', consultantId: 'cons-1' },
      makeUser({ roleName: 'admin' }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('JobOrdersService.update — bidirectional auto-clear on re-link', () => {
  function makeService(grants: Parameters<typeof grantsMock>[0] = {}) {
    const findUnique = jest
      .fn()
      // findOne (existing, before the update)
      .mockResolvedValueOnce(
        withRelations({ id: 'j1', clientId: 'cl1', consultantId: 'cons-1', client: { industryId: 'ind1' } }),
      )
      // final re-fetch for the response
      .mockResolvedValueOnce(withRelations({ id: 'j1', clientId: 'cl2', consultantId: null }));
    const update = jest
      .fn()
      .mockResolvedValue(withRelations({ id: 'j1', clientId: 'cl2', locationId: 'syd' }));
    const prisma = {
      jobOrder: { findUnique, update, findUniqueOrThrow: findUnique },
      ...grantsMock(grants),
      // the new client's industry
      client: { findUnique: jest.fn().mockResolvedValue({ industryId: 'ind2' }) },
    } as unknown as ExtendedPrismaClient;
    return { service: new JobOrdersService(prisma), update };
  }

  it('clears a now-uncovered consultant when re-linked to a different client', async () => {
    const { service, update } = makeService(); // cons-1 covers neither ind2 nor syd
    const result = await service.update('j1', { clientId: 'cl2' }, makeUser());

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'j1' }, data: { consultantId: null } }),
    );
    expect(result.consultantId).toBeNull();
  });

  it('leaves the consultant alone when their patch still covers the job order', async () => {
    const { service, update } = makeService({ locationIds: ['au'], locationCovers: true });
    await service.update('j1', { clientId: 'cl2' }, makeUser());
    expect(update).toHaveBeenCalledTimes(1);
  });

  // Location is an ownership arm now, so moving a job order re-checks even
  // when it stays with the same client.
  it('runs the auto-clear when only the location changed', async () => {
    const { service, update } = makeService();
    await service.update('j1', { locationId: 'mel' }, makeUser());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'j1' }, data: { consultantId: null } }),
    );
  });
});

describe('JobOrdersService — consultantId redaction for the consultant role', () => {
  const row = withRelations({ id: 'j1', consultantId: 'cons-1', client: { industryId: 'ind1' } });

  it('redacts consultantId to null in findAll for the consultant role', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { jobOrder: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    const result = await service.findAll(
      { page: 1, pageSize: 20, sortOrder: 'asc' } as never,
      makeUser({ roleName: 'consultant', consultantId: 'cons-1', industryIds: ['ind1'] }),
    );
    expect(result.data[0].consultantId).toBeNull();
  });

  it('does not redact consultantId for non-consultant roles', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { jobOrder: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    const result = await service.findAll(
      { page: 1, pageSize: 20, sortOrder: 'asc' } as never,
      makeUser({ roleName: 'manager' }),
    );
    expect(result.data[0].consultantId).toBe('cons-1');
  });

  it('redacts consultantId to null in findOne for the consultant role', async () => {
    const findUnique = jest.fn().mockResolvedValue(row);
    const prisma = { jobOrder: { findUnique } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    const result = await service.findOne(
      'j1',
      makeUser({ roleName: 'consultant', consultantId: 'cons-1', industryIds: ['ind1'] }),
    );
    expect(result.consultantId).toBeNull();
  });
});
