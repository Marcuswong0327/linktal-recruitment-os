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
    industryIds: [],
    specializationIds: [],
    locationIds: [],
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
  function makeService(existing: unknown = { id: 'cl1', industryId: 'ind1', stakeholders: [] }) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue({ id: 'cl1', stakeholders: [] });
    // The industry-first assignment guard needs somewhere to check a
    // candidate consultantId against — matches ind1 for cons-2 so tests
    // reassigning to that consultant aren't blocked by it.
    const consultantIndustry = {
      findUnique: jest.fn().mockResolvedValue({ consultantId: 'cons-2', industryId: 'ind1' }),
    };
    const prisma = { client: { findUnique, update }, consultantIndustry } as unknown as ExtendedPrismaClient;
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
    const { service, update } = makeService({ id: 'cl1', industryId: 'ind1', stakeholders: [] });
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

  it("AND's the industry scope with the free-text search instead of clobbering it", async () => {
    const { service, findMany } = makeService();
    await service.findAll(
      { ...baseQuery, q: 'acme' },
      makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['ind1', 'ind2'] }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: expect.any(Array) }, // the q search
      { industryId: { in: ['ind1', 'ind2'] } },
    ]);
  });

  it('does not add an industry scope for non-consultant roles', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, q: 'acme' }, makeUser({ roleName: 'admin' }));
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: expect.any(Array) }]);
  });
});

describe('ClientsService.findOne — job scope', () => {
  function makeService(client: unknown) {
    const findUnique = jest.fn().mockResolvedValue(client);
    const prisma = { client: { findUnique } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base) };
  }

  it('rejects a scoped consultant reaching an out-of-scope client directly', async () => {
    const { service } = makeService({ id: 'cl1', industryId: 'finance', stakeholders: [] });
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('rejects a scoped consultant reaching an untagged client', async () => {
    const { service } = makeService({ id: 'cl1', industryId: null, stakeholders: [] });
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('allows a scoped consultant reaching a matching-industry client', async () => {
    const { service } = makeService({ id: 'cl1', industryId: 'tech', stakeholders: [] });
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });

  it('never restricts non-consultant roles, regardless of industry', async () => {
    const { service } = makeService({ id: 'cl1', industryId: 'finance', stakeholders: [] });
    await expect(
      service.findOne('cl1', makeUser({ roleName: 'admin' })),
    ).resolves.toMatchObject({ id: 'cl1' });
  });
});

describe('ClientsService.create — industry-first assignment guard', () => {
  function makeService(consultantIndustryRow: unknown = null) {
    const create = jest.fn().mockResolvedValue({ id: 'cl1', stakeholders: [] });
    const consultantIndustry = { findUnique: jest.fn().mockResolvedValue(consultantIndustryRow) };
    const prisma = { client: { create }, consultantIndustry } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new ClientsService(prisma, base), create };
  }

  it('allows creating with no consultant assigned at all, tagged or not', async () => {
    const { service, create } = makeService();
    await service.create({ companyName: 'Acme' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects assigning a consultant when no industry is tagged', async () => {
    const { service } = makeService();
    await expect(
      service.create({ companyName: 'Acme', consultantId: 'cons-1' }),
    ).rejects.toMatchObject({ response: { code: 'INDUSTRY_REQUIRED' } });
  });

  it("rejects assigning a consultant whose industries don't include the tagged one", async () => {
    const { service } = makeService(null); // no matching ConsultantIndustry row
    await expect(
      service.create({ companyName: 'Acme', industryId: 'ind1', consultantId: 'cons-1' }),
    ).rejects.toMatchObject({ response: { code: 'CONSULTANT_INDUSTRY_MISMATCH' } });
  });

  it('allows assigning a consultant whose industries match', async () => {
    const { service, create } = makeService({ consultantId: 'cons-1', industryId: 'ind1' });
    await service.create({ companyName: 'Acme', industryId: 'ind1', consultantId: 'cons-1' });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('ClientsService.update — bidirectional auto-clear', () => {
  it('clears a now-mismatched consultant when the industry changes without touching consultantId', async () => {
    const findUnique = jest
      .fn()
      // findOne (existing, before the update)
      .mockResolvedValueOnce({ id: 'cl1', industryId: 'ind1', consultantId: 'cons-1', stakeholders: [] })
      // clearMismatchedClientAssignment's own lookup of the client's current consultantId
      .mockResolvedValueOnce({ consultantId: 'cons-1' })
      // final re-fetch for the response
      .mockResolvedValueOnce({ id: 'cl1', industryId: 'ind2', consultantId: null, stakeholders: [] });
    const update = jest.fn().mockResolvedValue({ id: 'cl1', industryId: 'ind2', stakeholders: [] });
    const consultantIndustry = { findUnique: jest.fn().mockResolvedValue(null) }; // cons-1 doesn't have ind2
    const jobOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      client: { findUnique, update, findUniqueOrThrow: findUnique },
      consultantIndustry,
      jobOrder,
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new ClientsService(prisma, base);

    const result = await service.update(
      'cl1',
      { industryId: 'ind2' } as unknown as UpdateClientDto,
      makeUser({ roleName: 'admin' }),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl1' }, data: { industryId: 'ind2' } }),
    );
    // The mismatched consultant got auto-cleared as a second, separate write.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl1' }, data: { consultantId: null } }),
    );
    expect(update).toHaveBeenCalledTimes(2);
    expect(result.consultantId).toBeNull();
  });

  it('does not touch the consultant when the industry change still matches them', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: 'cl1', industryId: 'ind1', consultantId: 'cons-1', stakeholders: [] })
      .mockResolvedValueOnce({ consultantId: 'cons-1' });
    const update = jest.fn().mockResolvedValue({ id: 'cl1', industryId: 'ind2', stakeholders: [] });
    const consultantIndustry = {
      findUnique: jest.fn().mockResolvedValue({ consultantId: 'cons-1', industryId: 'ind2' }),
    };
    const jobOrder = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      client: { findUnique, update },
      consultantIndustry,
      jobOrder,
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new ClientsService(prisma, base);

    await service.update(
      'cl1',
      { industryId: 'ind2' } as unknown as UpdateClientDto,
      makeUser({ roleName: 'admin' }),
    );

    // Still matches — only the one industryId write, no consultant clear.
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('ClientsService — consultantId redaction for the consultant role', () => {
  const row = { id: 'cl1', consultantId: 'cons-1', industryId: 'ind1', stakeholders: [] };

  it('redacts consultantId to null in findAll for the consultant role', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new ClientsService(prisma, {} as unknown as PrismaService);

    const result = await service.findAll(
      {
        page: 1,
        pageSize: 20,
        sortOrder: SortOrder.asc,
        status: ClientStatusFilter.ALL,
        quality: ClientQualityFilter.ALL,
      },
      makeUser({ roleName: 'consultant', consultantId: 'cons-1', industryIds: ['ind1'] }),
    );

    expect(result.data[0].consultantId).toBeNull();
  });

  it('does not redact consultantId for non-consultant roles', async () => {
    const findMany = jest.fn().mockResolvedValue([row]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { client: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new ClientsService(prisma, {} as unknown as PrismaService);

    const result = await service.findAll(
      {
        page: 1,
        pageSize: 20,
        sortOrder: SortOrder.asc,
        status: ClientStatusFilter.ALL,
        quality: ClientQualityFilter.ALL,
      },
      makeUser({ roleName: 'admin' }),
    );

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
