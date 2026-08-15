import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientStatus } from '@prisma/client';
import { JobResearchService } from './job-research.service';
import { JobResearchSortField, QueryJobResearchDto, SortOrder } from './dto/query-job-research.dto';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
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

function baseQuery(overrides: Partial<QueryJobResearchDto> = {}): QueryJobResearchDto {
  return { page: 1, pageSize: 20, sortOrder: SortOrder.asc, ...overrides } as QueryJobResearchDto;
}

/** The relation keys JOB_RESEARCH_INCLUDE pulls in — `toEntity` destructures all of them. */
function withRelations(row: Record<string, unknown> = {}) {
  return {
    client: { companyName: 'Acme Corp', industryId: 'ind1' },
    consultant: null,
    jobTitle: null,
    jobRoleType: null,
    location: null,
    jobOrder: null,
    ...row,
  };
}

describe('JobResearchService.create', () => {
  it('creates without setting displayId, converts ISO dates, and resolves the FK names', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({
        id: 'jr1',
        displayId: 'JR-0042',
        clientId: 'cl1',
        isContacted: false,
        consultant: { fullName: 'Rita Researcher' },
        jobTitle: { name: 'Maintenance Fitter' },
        jobRoleType: { name: 'Mechanical Fitter' },
        location: { name: 'Mackay', level: 'CITY', ancestorIds: ['mky', 'qld', 'au'] },
      }),
    );
    const prisma = { clientJobResearch: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobResearchService(prisma, {} as PrismaService);

    const result = await service.create({ clientId: 'cl1', postedDate: '2026-07-01T00:00:00.000Z' });

    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(create.mock.calls[0][0].data.postedDate).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    expect(result).toEqual({
      id: 'jr1',
      displayId: 'JR-0042',
      clientId: 'cl1',
      isContacted: false,
      companyName: 'Acme Corp',
      consultant: 'Rita Researcher',
      jobTitle: 'Maintenance Fitter',
      jobRoleType: 'Mechanical Fitter',
      location: 'Mackay',
      locationLevel: 'CITY',
      jobOrderId: null,
    });
  });

  it('leaves researchedAt to the DB default when the caller omits it', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'jr1' }));
    const prisma = { clientJobResearch: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobResearchService(prisma, {} as PrismaService);

    await service.create({ clientId: 'cl1' });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('researchedAt');
  });
});

describe('JobResearchService.findAll', () => {
  function setup(rows: Record<string, unknown>[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows.map((r) => withRelations(r)));
    const count = jest.fn().mockResolvedValue(rows.length);
    const prisma = { clientJobResearch: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { service: new JobResearchService(prisma, {} as PrismaService), findMany };
  }

  it('paginates and defaults to most recently researched', async () => {
    const { service, findMany } = setup([{ id: 'jr1' }]);
    const result = await service.findAll(baseQuery({ page: 3, pageSize: 10 }), makeUser());

    expect(findMany.mock.calls[0][0]).toMatchObject({
      skip: 20,
      take: 10,
      orderBy: { researchedAt: 'desc' },
    });
    expect(result).toMatchObject({ total: 1, page: 3, pageSize: 10 });
  });

  // An ad with no visible posted date, or an advertiser never approached,
  // belongs at the bottom of those sorts rather than the top.
  it('sorts the nullable date columns with nulls last', async () => {
    const { service, findMany } = setup();
    await service.findAll(
      baseQuery({ sortBy: JobResearchSortField.postedDate, sortOrder: SortOrder.desc }),
      makeUser(),
    );
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ postedDate: { sort: 'desc', nulls: 'last' } });

    await service.findAll(baseQuery({ sortBy: JobResearchSortField.displayId }), makeUser());
    expect(findMany.mock.calls[1][0].orderBy).toEqual({ displayId: 'asc' });
  });

  it('maps hasJobOrder onto the conversion back-reference', async () => {
    const { service, findMany } = setup();
    await service.findAll(baseQuery({ hasJobOrder: true }), makeUser());
    expect(findMany.mock.calls[0][0].where.jobOrder).toEqual({ isNot: null });

    await service.findAll(baseQuery({ hasJobOrder: false }), makeUser());
    expect(findMany.mock.calls[1][0].where.jobOrder).toEqual({ is: null });
  });

  it('filters by status snapshot, contacted flag and catalog ids', async () => {
    const { service, findMany } = setup();
    await service.findAll(
      baseQuery({
        statuses: [ClientStatus.COLD],
        isContacted: false,
        jobRoleTypeIds: ['rt1'],
        clientIds: ['cl1', 'cl2'],
      }),
      makeUser(),
    );
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      status: { in: [ClientStatus.COLD] },
      isContacted: false,
      jobRoleTypeId: { in: ['rt1'] },
      clientId: { in: ['cl1', 'cl2'] },
    });
  });

  it('matches a location node plus everything beneath it', async () => {
    const { service, findMany } = setup();
    await service.findAll(baseQuery({ locationIds: ['qld'] }), makeUser());
    expect(findMany.mock.calls[0][0].where.AND[0]).toEqual({
      location: { ancestorIds: { hasSome: ['qld'] } },
    });
  });

  // Research is market intelligence, not an assignment: a researcher logs the
  // ads and whoever covers that patch works them. An own-book filter (which
  // Client and JobOrder both apply) would hide exactly the leads this step
  // exists to hand over.
  it('does not restrict a consultant to rows they personally researched', async () => {
    const { service, findMany } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'consultant', industryIds: ['ind1'] }));

    expect(findMany.mock.calls[0][0].where.consultantId).toBeUndefined();
    // The scope arm is still applied — it just isn't an own-book filter.
    expect(findMany.mock.calls[0][0].where.AND).toHaveLength(1);
  });

  it('honours an explicit consultantIds filter for an unscoped role', async () => {
    const { service, findMany } = setup();
    await service.findAll(baseQuery({ consultantIds: ['c1'] }), makeUser({ roleName: 'manager' }));
    expect(findMany.mock.calls[0][0].where.consultantId).toEqual({ in: ['c1'] });
    expect(findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it('ANDs the free-text search together with the scope filter', async () => {
    const { service, findMany } = setup();
    await service.findAll(
      baseQuery({ q: 'fitter' }),
      makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
    );
    const and = findMany.mock.calls[0][0].where.AND;
    expect(and).toHaveLength(2);
    expect(and[0].OR).toHaveLength(4);
    expect(and[1].OR).toBeDefined();
  });
});

// findOne no longer gates on scope — it's a plain existence check now (see
// common/scope.ts: scope is a list filter only). ClientJobResearch.consultantId
// ("who conducted this research") is descriptive metadata only — it was never
// folded into `jobResearchScope` as an ownership arm even before this change,
// since research isn't job-order-scoped.
describe('JobResearchService.findOne', () => {
  function setup(row: Record<string, unknown> | null) {
    const findUnique = jest.fn().mockResolvedValue(row === null ? null : withRelations(row));
    const prisma = { clientJobResearch: { findUnique } } as unknown as ExtendedPrismaClient;
    return { service: new JobResearchService(prisma, {} as PrismaService) };
  }

  it('404s when the row does not exist', async () => {
    const { service } = setup(null);
    await expect(service.findOne('nope', makeUser())).rejects.toThrow(NotFoundException);
  });

  it('returns the row for a scoped consultant even when neither arm matches', async () => {
    const { service } = setup({
      id: 'jr1',
      consultantId: null,
      client: { companyName: 'Acme', industryId: 'other' },
    });
    await expect(
      service.findOne('jr1', makeUser({ roleName: 'consultant', industryIds: ['ind1'] })),
    ).resolves.toMatchObject({ id: 'jr1' });
  });

  it('never leaks the scope-only relation fields into the response', async () => {
    const { service } = setup({ id: 'jr1' });
    const result = await service.findOne('jr1', makeUser());
    expect(result).not.toHaveProperty('client');
    expect(result).not.toHaveProperty('industryId');
    expect(result).not.toHaveProperty('jobOrder');
  });
});

describe('JobResearchService.markContacted', () => {
  function setup(lastContactedAt: Date | null) {
    const findUnique = jest
      .fn()
      .mockResolvedValue(withRelations({ id: 'jr1', consultantId: 'me', lastContactedAt }));
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'jr1', isContacted: true }));
    const prisma = {
      clientJobResearch: { findUnique, update },
    } as unknown as ExtendedPrismaClient;
    return { service: new JobResearchService(prisma, {} as PrismaService), update };
  }

  it('flips the flag and attributes the approach to the caller’s own session', async () => {
    const { service, update } = setup(null);
    await service.markContacted('jr1', '2026-07-15T00:00:00.000Z', makeUser({ consultantId: 'c9' }));

    expect(update.mock.calls[0][0].data).toEqual({
      isContacted: true,
      lastContactedAt: new Date('2026-07-15T00:00:00.000Z'),
      lastContactedById: 'c9',
    });
  });

  // Backdating an approach must not clobber a more recent one someone else
  // already logged — the flag still flips, the when/who only moves forward.
  it('does not move lastContactedAt backwards', async () => {
    const { service, update } = setup(new Date('2026-07-20T00:00:00.000Z'));
    await service.markContacted('jr1', '2026-07-15T00:00:00.000Z', makeUser());

    expect(update.mock.calls[0][0].data).toEqual({ isContacted: true });
  });
});

describe('JobResearchService.remove / restore / purge', () => {
  it('soft-deletes without cascading — a JobOrder that cited it keeps its record', async () => {
    const findUnique = jest.fn().mockResolvedValue(withRelations({ id: 'jr1', consultantId: 'me' }));
    const del = jest.fn().mockResolvedValue({ id: 'jr1' });
    const prisma = {
      clientJobResearch: { findUnique, delete: del },
    } as unknown as ExtendedPrismaClient;
    const service = new JobResearchService(prisma, {} as PrismaService);

    await service.remove('jr1', makeUser());
    expect(del).toHaveBeenCalledWith({ where: { id: 'jr1' } });
  });

  it('rejects restoring a row that is not deleted', async () => {
    const base = {
      clientJobResearch: { findUnique: jest.fn().mockResolvedValue({ id: 'jr1', deletedAt: null }) },
    } as unknown as PrismaService;
    const service = new JobResearchService({} as ExtendedPrismaClient, base);
    await expect(service.restore('jr1')).rejects.toThrow(BadRequestException);
  });

  it('clears both soft-delete columns on restore', async () => {
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'jr1' }));
    const prisma = { clientJobResearch: { update } } as unknown as ExtendedPrismaClient;
    const base = {
      clientJobResearch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'jr1', deletedAt: new Date() }),
      },
    } as unknown as PrismaService;
    const service = new JobResearchService(prisma, base);

    await service.restore('jr1');
    expect(update.mock.calls[0][0].data).toEqual({ deletedAt: null, deletedById: null });
  });

  it('writes a HARD_DELETE audit row before erasing, via the base client', async () => {
    const order: string[] = [];
    const auditCreate = jest.fn().mockImplementation(() => {
      order.push('audit');
      return Promise.resolve({});
    });
    const del = jest.fn().mockImplementation(() => {
      order.push('delete');
      return Promise.resolve({ id: 'jr1' });
    });
    const base = {
      clientJobResearch: { findUnique: jest.fn().mockResolvedValue({ id: 'jr1' }), delete: del },
      auditLog: { create: auditCreate },
    } as unknown as PrismaService;
    const service = new JobResearchService({} as ExtendedPrismaClient, base);

    await service.purge('jr1');
    expect(order).toEqual(['audit', 'delete']);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'HARD_DELETE',
      entityType: 'ClientJobResearch',
      entityId: 'jr1',
    });
  });
});
