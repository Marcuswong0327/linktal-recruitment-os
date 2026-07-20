import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientQualityFilter, ClientStatusFilter, QueryClientsDto, SortOrder } from './dto/query-clients.dto';
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
    ...overrides,
  };
}

describe('ClientsService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = {
      id: 'cl1',
      displayId: 'Client-0101',
      companyName: 'Acme Corp',
      industry: null,
      specialization: null,
      stakeholders: [],
    };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { client: { create } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new ClientsService(prisma, base);

    const dto: CreateClientDto = { companyName: 'Acme Corp' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toEqual({
      id: 'cl1',
      displayId: 'Client-0101',
      companyName: 'Acme Corp',
      industry: null,
      specialization: null,
      lastContactType: null,
      lastContactNotes: null,
      lastContactedBy: null,
    });
  });
});

describe('ClientsService.remove (cascade soft-delete)', () => {
  it('cascades to job orders + their submissions/placements, stakeholders and research', async () => {
    const prisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cl1', companyName: 'Acme', stakeholders: [] }),
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
    };
    const service = new ClientsService(
      prisma as unknown as ExtendedPrismaClient,
      {} as unknown as PrismaService,
    );

    await service.remove('cl1');

    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['s1'] } },
    });
    expect(prisma.candidateSubmission.deleteMany).toHaveBeenCalledWith({
      where: { jobOrderId: { in: ['j1'] } },
    });
    expect(prisma.jobOrder.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.stakeholder.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.clientJobResearch.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
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
  function makeService(existing: unknown = { id: 'cl1', stakeholders: [] }) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue({ id: 'cl1', stakeholders: [] });
    const prisma = { client: { findUnique, update } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), update };
  }

  it('passes null straight through for cleared nullable fields, instead of stripping them', async () => {
    const { service, update } = makeService();
    // Generated type omits null (Prisma/class-validator accept it at
    // runtime) — same gap the frontend casts around.
    const dto = {
      consultantId: null,
      industryId: null,
      city: null,
      country: null,
      feePercentage: null,
    } as unknown as UpdateClientDto;

    await service.update('cl1', dto, makeUser());

    expect(update).toHaveBeenCalledWith({
      where: { id: 'cl1' },
      data: dto,
      include: expect.any(Object),
    });
    const savedData = update.mock.calls[0][0].data;
    expect(savedData.consultantId).toBeNull();
    expect(savedData.industryId).toBeNull();
    expect(savedData.city).toBeNull();
    expect(savedData.country).toBeNull();
    expect(savedData.feePercentage).toBeNull();
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
  function makeService(existing: unknown = { id: 'cl1', stakeholders: [] }) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue({ id: 'cl1', stakeholders: [] });
    const prisma = { client: { findUnique, update } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), update };
  }

  it('rejects a consultant clearing consultantId with null', async () => {
    const { service } = makeService();
    await expect(
      service.update(
        'cl1',
        { consultantId: null } as unknown as UpdateClientDto,
        makeUser({ roleName: 'consultant' }),
      ),
    ).rejects.toThrow('Consultants cannot unassign a company from a consultant.');
  });

  it('rejects a consultant clearing consultantId with the "" sentinel', async () => {
    const { service } = makeService();
    await expect(
      service.update(
        'cl1',
        { consultantId: '' } as unknown as UpdateClientDto,
        makeUser({ roleName: 'consultant' }),
      ),
    ).rejects.toThrow('Consultants cannot unassign a company from a consultant.');
  });

  it('allows a consultant reassigning to a different consultant', async () => {
    const { service, update } = makeService();
    await service.update(
      'cl1',
      { consultantId: 'cons-2' },
      makeUser({ roleName: 'consultant' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('allows a consultant updating other fields without touching consultantId', async () => {
    const { service, update } = makeService();
    await service.update('cl1', { companyName: 'Acme 2' }, makeUser({ roleName: 'consultant' }));
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
describe('ClientsService.findAll — consultantId filter', () => {
  function makeService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(rows.length);
    const $transaction = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));
    const prisma = { client: { findMany, count }, $transaction } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), findMany };
  }

  const baseQuery: QueryClientsDto = {
    page: 1,
    pageSize: 20,
    sortOrder: SortOrder.asc,
    status: ClientStatusFilter.ALL,
    quality: ClientQualityFilter.ALL,
  };

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
    const $transaction = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));
    const prisma = { client: { findMany, count }, $transaction } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), findMany };
  }

  const baseQuery: QueryClientsDto = {
    page: 1,
    pageSize: 20,
    sortOrder: SortOrder.asc,
    status: ClientStatusFilter.ALL,
    quality: ClientQualityFilter.ALL,
  };

  it('forces the filter to the caller\'s own consultantId, even when none is passed', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser({ roleName: 'consultant', consultantId: 'cons-me' }));
    expect(findMany.mock.calls[0][0].where.consultantId).toBe('cons-me');
  });

  it('ignores a caller-supplied consultantId and uses the caller\'s own id instead', async () => {
    const { service, findMany } = makeService();
    await service.findAll(
      { ...baseQuery, consultantId: 'someone-elses-id' },
      makeUser({ roleName: 'consultant', consultantId: 'cons-me' }),
    );
    expect(findMany.mock.calls[0][0].where.consultantId).toBe('cons-me');
  });

  it('does not restrict non-consultant roles (e.g. manager)', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery }, makeUser({ roleName: 'manager', consultantId: 'mgr-1' }));
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('consultantId');
  });
});
