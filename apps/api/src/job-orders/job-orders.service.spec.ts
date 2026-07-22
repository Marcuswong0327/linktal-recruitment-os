import { JobOrdersService } from './job-orders.service';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
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
    ...overrides,
  };
}

describe('JobOrdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'j1', displayId: 'JO-0069', jobTitle: 'Production Manager', submissions: [] };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { jobOrder: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    const dto: CreateJobOrderDto = { clientId: 'cl1', jobTitle: 'Production Manager' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toMatchObject({ id: 'j1', displayId: 'JO-0069', jobTitle: 'Production Manager' });
    expect(result.pipelineSubmissions).toEqual([]);
  });
});

describe('JobOrdersService.remove (cascade soft-delete)', () => {
  it('cascades to its submissions + their placements, then deletes the job order', async () => {
    const prisma = {
      jobOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: 'j1', jobTitle: 'PM', submissions: [] }),
        delete: jest.fn().mockResolvedValue({ id: 'j1' }),
      },
      candidateSubmission: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      placement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new JobOrdersService(prisma as unknown as ExtendedPrismaClient);

    await service.remove('j1', makeUser());

    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['s1', 's2'] } },
    });
    expect(prisma.candidateSubmission.deleteMany).toHaveBeenCalledWith({
      where: { jobOrderId: 'j1' },
    });
    expect(prisma.jobOrder.delete).toHaveBeenCalledWith({ where: { id: 'j1' } });
  });
});

describe('JobOrdersService.findAll — industry scope via parent Client', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { jobOrder: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { findMany, service: new JobOrdersService(prisma) };
  }

  const baseQuery = { page: 1, pageSize: 20, sortOrder: 'asc' } as unknown as Record<string, unknown>;

  it("ANDs the industry scope (via the parent Client) with the free-text search", async () => {
    const { findMany, service } = setup();
    await service.findAll(
      { ...baseQuery, q: 'manager' } as never,
      makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['ind1'] }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: expect.any(Array) },
      { client: { industryId: { in: ['ind1'] } } },
    ]);
    // the pre-existing ownership scoping still applies too
    expect(where.consultantId).toBe('cons-me');
  });

  it('does not add an industry scope for non-consultant roles', async () => {
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

  it('rejects a scoped consultant reaching a job order whose parent Client is out of scope', async () => {
    const { service } = makeService({ id: 'j1', client: { industryId: 'finance' }, submissions: [] });
    await expect(
      service.findOne('j1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('allows a scoped consultant reaching a job order whose parent Client matches', async () => {
    const { service } = makeService({ id: 'j1', client: { industryId: 'tech' }, submissions: [] });
    await expect(
      service.findOne('j1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).resolves.toMatchObject({ id: 'j1' });
  });
});

describe('JobOrdersService.create — industry-first assignment guard', () => {
  function makeService(consultantIndustryRow: unknown = null, clientRow: unknown = { industryId: 'ind1' }) {
    const create = jest.fn().mockResolvedValue({ id: 'j1', submissions: [] });
    const consultantIndustry = { findUnique: jest.fn().mockResolvedValue(consultantIndustryRow) };
    const client = { findUnique: jest.fn().mockResolvedValue(clientRow) };
    const prisma = { jobOrder: { create }, consultantIndustry, client } as unknown as ExtendedPrismaClient;
    return { service: new JobOrdersService(prisma), create };
  }

  it('rejects assigning a consultant when the client has no industry tagged', async () => {
    const { service } = makeService(null, { industryId: null });
    await expect(
      service.create({ clientId: 'cl1', jobTitle: 'PM', consultantId: 'cons-1' }),
    ).rejects.toMatchObject({ response: { code: 'INDUSTRY_REQUIRED' } });
  });

  it("rejects assigning a consultant whose industries don't match the client's", async () => {
    const { service } = makeService(null);
    await expect(
      service.create({ clientId: 'cl1', jobTitle: 'PM', consultantId: 'cons-1' }),
    ).rejects.toMatchObject({ response: { code: 'CONSULTANT_INDUSTRY_MISMATCH' } });
  });

  it('allows assigning a consultant whose industries match the client', async () => {
    const { service, create } = makeService({ consultantId: 'cons-1', industryId: 'ind1' });
    await service.create({ clientId: 'cl1', jobTitle: 'PM', consultantId: 'cons-1' });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('JobOrdersService.update — bidirectional auto-clear on re-link', () => {
  it('clears a now-mismatched consultant when re-linked to a different client', async () => {
    const findUnique = jest
      .fn()
      // findOne (existing, before the update)
      .mockResolvedValueOnce({ id: 'j1', clientId: 'cl1', consultantId: 'cons-1', client: { industryId: 'ind1' }, submissions: [] })
      // final re-fetch for the response
      .mockResolvedValueOnce({ id: 'j1', clientId: 'cl2', consultantId: null, submissions: [] });
    const update = jest.fn().mockResolvedValue({ id: 'j1', clientId: 'cl2', submissions: [] });
    const client = { findUnique: jest.fn().mockResolvedValue({ industryId: 'ind2' }) }; // the new client's industry
    const consultantIndustry = { findUnique: jest.fn().mockResolvedValue(null) }; // cons-1 doesn't have ind2
    const prisma = {
      jobOrder: { findUnique, update, findUniqueOrThrow: findUnique },
      client,
      consultantIndustry,
    } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    const result = await service.update('j1', { clientId: 'cl2' } as never, makeUser());

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'j1' }, data: { consultantId: null } }),
    );
    expect(result.consultantId).toBeNull();
  });
});

describe('JobOrdersService — consultantId redaction for the consultant role', () => {
  const row = { id: 'j1', consultantId: 'cons-1', client: { industryId: 'ind1' }, submissions: [] };

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
