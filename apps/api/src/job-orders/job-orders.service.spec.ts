import { JobOrdersService } from './job-orders.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

// `base` is only read by exportAll/exportByIds (for logExport), neither of
// which any test in this file exercises — a bare stand-in is enough.
const base = {} as unknown as PrismaService;

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
    consultants: [],
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
    const service = new JobOrdersService(prisma, base);

    const result = await service.create({ clientId: 'cl1', jobTitleId: 'jt-1' }, makeUser());

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toMatchObject({ id: 'j1', displayId: 'JO-0069', jobTitle: 'Production Manager' });
    expect(result.pipelineSubmissions).toEqual([]);
    expect(result.consultants).toEqual([]);
  });

  // Unlike Stakeholder, a job order never grows the JobTitle catalog on the
  // way past — it takes catalog ids only, and a title new to the catalog is
  // created through /job-titles first.
  it('passes the catalog ids straight through without touching the catalog', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'j1' }));
    const prisma = { jobOrder: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma, base);

    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1', jobRoleTypeId: 'jrt-1' }, makeUser());

    expect(create.mock.calls[0][0].data).toMatchObject({ jobTitleId: 'jt-1', jobRoleTypeId: 'jrt-1' });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('jobTitle');
  });

  // consultantIds seeds the join table at creation time — a nested write is
  // fine here (unlike setConsultants) since there's no existing set to diff
  // against on a brand-new row.
  it('nests consultantIds as a create on the join relation', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'j1' }));
    const prisma = { jobOrder: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma, base);

    await service.create(
      { clientId: 'cl1', jobTitleId: 'jt-1', consultantIds: ['c1', 'c2'] },
      makeUser(),
    );

    expect(create.mock.calls[0][0].data.consultants).toEqual({
      create: [{ consultantId: 'c1' }, { consultantId: 'c2' }],
    });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('consultantIds');
  });

  it('omits the consultants relation write entirely when none are given', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'j1' }));
    const prisma = { jobOrder: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma, base);

    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1' }, makeUser());

    expect(create.mock.calls[0][0].data).not.toHaveProperty('consultants');
  });
});

// Cascading to submissions (and their placements) is no longer this service's
// job — it's handled centrally by the Prisma extension's CASCADE_MAP for any
// delete path, not just this one. See prisma.extensions.spec.ts.
describe('JobOrdersService.remove', () => {
  it('checks existence, then hands off to a plain delete', async () => {
    const prisma = {
      jobOrder: {
        findUnique: jest.fn().mockResolvedValue(withRelations({ id: 'j1' })),
        delete: jest.fn().mockResolvedValue({ id: 'j1' }),
      },
    };
    const service = new JobOrdersService(prisma as unknown as ExtendedPrismaClient, base);

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
    return { findMany, service: new JobOrdersService(prisma, base) };
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

  // consultantIds now matches through the JobOrderConsultant join, not a
  // scalar column — several consultants can be on the same job order.
  it('matches consultantIds through the join relation, any-of semantics', async () => {
    const { findMany, service } = setup();
    await service.findAll({ ...baseQuery, consultantIds: ['c1', 'c2'] } as never, makeUser());

    expect(findMany.mock.calls[0][0].where.consultants).toEqual({
      some: { consultantId: { in: ['c1', 'c2'] } },
    });
  });

  it('filters by qualities enum list', async () => {
    const { findMany, service } = setup();
    await service.findAll({ ...baseQuery, qualities: ['HIGH', 'MEDIUM'] } as never, makeUser());

    expect(findMany.mock.calls[0][0].where.quality).toEqual({ in: ['HIGH', 'MEDIUM'] });
  });

  it('filters by clientIds any-of, preferring the array over a lone clientId', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      { ...baseQuery, clientIds: ['cl1', 'cl2'], clientId: 'ignored' } as never,
      makeUser(),
    );

    expect(findMany.mock.calls[0][0].where.clientId).toEqual({ in: ['cl1', 'cl2'] });
  });
});

// visible = (industry via parent Client) OR own location OR direct
// membership on the job order's consultant list — three arms OR-ed, pure list
// filter, no ownership arm.
describe('JobOrdersService.findAll — scope', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { jobOrder: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { findMany, service: new JobOrdersService(prisma, base) };
  }

  const baseQuery = { page: 1, pageSize: 20, sortOrder: 'asc' } as unknown as Record<string, unknown>;

  it('ANDs the scope (industry via parent Client, own location, or membership) with the free-text search', async () => {
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
          { client: { industryId: { in: ['ind1'] } } },
          { location: { ancestorIds: { hasSome: ['qld'] } } },
          { consultants: { some: { consultantId: 'cons-me' } } },
        ],
      },
    ]);
  });

  // Zero grants means "not configured", never "sees everything" — but the
  // job-order-membership arm doesn't depend on grants at all, so a consultant
  // added directly to a job order still reaches it even before anything else
  // is configured for them.
  it('keeps the membership arm for a consultant with no grants at all', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery as never,
      makeUser({ roleName: 'consultant', consultantId: 'cons-me' }),
    );

    const scope = findMany.mock.calls[0][0].where.AND[0];
    expect(scope.OR).toEqual([
      { client: { industryId: { in: [] } } },
      { location: { ancestorIds: { hasSome: [] } } },
      { consultants: { some: { consultantId: 'cons-me' } } },
    ]);
  });

  it('does not scope non-consultant roles', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery as never, makeUser({ roleName: 'manager' }));
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
  });
});

// findOne no longer gates on scope — scope is a list filter only now (see
// common/scope.ts). A direct fetch by id always succeeds.
describe('JobOrdersService.findOne', () => {
  function makeService(jobOrder: unknown) {
    const findUnique = jest.fn().mockResolvedValue(jobOrder);
    const prisma = { jobOrder: { findUnique } } as unknown as ExtendedPrismaClient;
    return { service: new JobOrdersService(prisma, base) };
  }

  it('returns the record for a scoped consultant even when no arm matches', async () => {
    const { service } = makeService(
      withRelations({
        id: 'j1',
        client: { industryId: 'finance', stakeholders: [] },
        location: { name: 'Perth', level: 'CITY', ancestorIds: ['perth', 'wa', 'au'] },
      }),
    );
    await expect(
      service.findOne('j1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['qld'] })),
    ).resolves.toMatchObject({ id: 'j1' });
  });

  it('resolves the consultants list to id/name pairs', async () => {
    const { service } = makeService(
      withRelations({
        id: 'j1',
        consultants: [
          { consultantId: 'c1', consultant: { fullName: 'Joshua Fang' } },
          { consultantId: 'c2', consultant: { fullName: 'Kim Chan' } },
        ],
      }),
    );
    const result = await service.findOne('j1', makeUser());
    expect(result.consultants).toEqual([
      { id: 'c1', name: 'Joshua Fang' },
      { id: 'c2', name: 'Kim Chan' },
    ]);
  });

  it('throws NotFound when the job order does not exist, for every role', async () => {
    const { service } = makeService(null);
    await expect(
      service.findOne('missing', makeUser({ roleName: 'consultant' })),
    ).rejects.toThrow('Job order missing not found');
  });
});

describe('JobOrdersService.update', () => {
  function makeService(existing: unknown = withRelations({ id: 'j1' })) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'j1', clientId: 'cl2' }));
    const prisma = { jobOrder: { findUnique, update } } as unknown as ExtendedPrismaClient;
    return { service: new JobOrdersService(prisma, base), update };
  }

  it('re-links to a different client with no follow-up write and no guard', async () => {
    const { service, update } = makeService();
    await service.update('j1', { clientId: 'cl2' }, makeUser());

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'j1' }, data: { clientId: 'cl2' } }),
    );
  });
});

// Full-set-replace of who's working a job order, mirroring
// ConsultantsService.setIndustries's diff shape. No scope-mismatch guard —
// this is deliberately the escape hatch for reaching an out-of-scope
// client/candidate.
describe('JobOrdersService.setConsultants', () => {
  function makeService(
    current: { consultantId: string }[] = [],
    consultantRows: { id: string; isActive: boolean }[] = [],
  ) {
    const jobOrderConsultantDelete = jest.fn().mockResolvedValue({});
    const jobOrderConsultantCreate = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue(withRelations({ id: 'j1' }));
    const prisma = {
      jobOrder: { findUnique },
      jobOrderConsultant: {
        findMany: jest.fn().mockResolvedValue(current),
        delete: jobOrderConsultantDelete,
        create: jobOrderConsultantCreate,
      },
      consultant: { findMany: jest.fn().mockResolvedValue(consultantRows) },
    } as unknown as ExtendedPrismaClient;
    return { service: new JobOrdersService(prisma, base), jobOrderConsultantDelete, jobOrderConsultantCreate };
  }

  it('404s when the job order does not exist', async () => {
    const prisma = {
      jobOrder: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma, base);
    await expect(service.setConsultants('missing', ['c1'], makeUser())).rejects.toThrow(
      'Job order missing not found',
    );
  });

  it('rejects an unknown consultant id', async () => {
    const { service } = makeService([], []);
    await expect(service.setConsultants('j1', ['c1'], makeUser())).rejects.toMatchObject({
      response: { code: 'INVALID_CONSULTANT' },
    });
  });

  it('rejects an inactive consultant id', async () => {
    const { service } = makeService([], [{ id: 'c1', isActive: false }]);
    await expect(service.setConsultants('j1', ['c1'], makeUser())).rejects.toMatchObject({
      response: { code: 'INACTIVE_CONSULTANT' },
    });
  });

  it('adds consultants not already on the job order', async () => {
    const { service, jobOrderConsultantCreate, jobOrderConsultantDelete } = makeService(
      [],
      [{ id: 'c1', isActive: true }, { id: 'c2', isActive: true }],
    );
    await service.setConsultants('j1', ['c1', 'c2'], makeUser());

    expect(jobOrderConsultantCreate).toHaveBeenCalledWith({ data: { jobOrderId: 'j1', consultantId: 'c1' } });
    expect(jobOrderConsultantCreate).toHaveBeenCalledWith({ data: { jobOrderId: 'j1', consultantId: 'c2' } });
    expect(jobOrderConsultantDelete).not.toHaveBeenCalled();
  });

  it('removes consultants no longer in the set, before adding new ones', async () => {
    const { service, jobOrderConsultantCreate, jobOrderConsultantDelete } = makeService(
      [{ consultantId: 'c1' }, { consultantId: 'c2' }],
      [{ id: 'c3', isActive: true }],
    );
    await service.setConsultants('j1', ['c3'], makeUser());

    expect(jobOrderConsultantDelete).toHaveBeenCalledWith({
      where: { jobOrderId_consultantId: { jobOrderId: 'j1', consultantId: 'c1' } },
    });
    expect(jobOrderConsultantDelete).toHaveBeenCalledWith({
      where: { jobOrderId_consultantId: { jobOrderId: 'j1', consultantId: 'c2' } },
    });
    expect(jobOrderConsultantCreate).toHaveBeenCalledWith({ data: { jobOrderId: 'j1', consultantId: 'c3' } });
  });

  it('leaves an already-present consultant untouched', async () => {
    const { service, jobOrderConsultantCreate, jobOrderConsultantDelete } = makeService(
      [{ consultantId: 'c1' }],
      [{ id: 'c1', isActive: true }],
    );
    await service.setConsultants('j1', ['c1'], makeUser());

    expect(jobOrderConsultantCreate).not.toHaveBeenCalled();
    expect(jobOrderConsultantDelete).not.toHaveBeenCalled();
  });

  // No industry/location validation at all — this is the deliberate
  // out-of-scope escape hatch, unlike every other assignment path in the app.
  it('accepts a consultant with no matching industry or location grants', async () => {
    const { service, jobOrderConsultantCreate } = makeService(
      [],
      [{ id: 'out-of-scope-consultant', isActive: true }],
    );
    await service.setConsultants('j1', ['out-of-scope-consultant'], makeUser());
    expect(jobOrderConsultantCreate).toHaveBeenCalledWith({
      data: { jobOrderId: 'j1', consultantId: 'out-of-scope-consultant' },
    });
  });

  it('dedupes repeated ids in the request', async () => {
    const { service, jobOrderConsultantCreate } = makeService([], [{ id: 'c1', isActive: true }]);
    await service.setConsultants('j1', ['c1', 'c1'], makeUser());
    expect(jobOrderConsultantCreate).toHaveBeenCalledTimes(1);
  });
});
