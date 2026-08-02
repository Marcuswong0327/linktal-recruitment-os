import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CandidateStatus, PlacementStatus, SubmissionStatus } from '@prisma/client';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { QueryCandidatesDto, SortOrder } from './dto/query-candidates.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';

function baseQuery(overrides: Partial<QueryCandidatesDto> = {}): QueryCandidatesDto {
  return { page: 1, pageSize: 20, sortOrder: SortOrder.asc, ...overrides } as QueryCandidatesDto;
}

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

describe('CandidatesService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = {
      id: 'c1',
      displayId: 'CDD-0105',
      fullName: 'Jane Doe',
      contactHistory: [],
      industry: null,
      roleType: null,
      specializations: [],
    };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { candidate: { create } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new CandidatesService(prisma, base);

    const dto: CreateCandidateDto = { fullName: 'Jane Doe' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toEqual({
      id: 'c1',
      displayId: 'CDD-0105',
      fullName: 'Jane Doe',
      industry: null,
      roleType: null,
      specializations: [],
      specializationIds: [],
      lastContactType: null,
      lastContactNotes: null,
      lastContactedBy: null,
    });
  });

  it('nests specializationIds as a create on the join relation', async () => {
    const created = {
      id: 'c1',
      fullName: 'Jane Doe',
      contactHistory: [],
      industry: null,
      roleType: null,
      specializations: [],
    };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { candidate: { create } } as unknown as ExtendedPrismaClient;
    const service = new CandidatesService(prisma, {} as unknown as PrismaService);

    await service.create({ fullName: 'Jane Doe', specializationIds: ['spec1', 'spec2'] });

    expect(create.mock.calls[0][0].data.specializations).toEqual({
      create: [{ specializationId: 'spec1' }, { specializationId: 'spec2' }],
    });
  });
});

// The extended client rewrites delete()/deleteMany() to soft-deletes, so these
// specs assert the service issues the right *cascade* calls (children first),
// not the physical SQL.
describe('CandidatesService.remove (cascade soft-delete)', () => {
  function setup(submissionIds: string[]) {
    const prisma = {
      candidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          fullName: 'Jane',
          contactHistory: [],
          industry: null,
          roleType: null,
          specializations: [],
        }),
        delete: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      candidateSubmission: {
        findMany: jest.fn().mockResolvedValue(submissionIds.map((id) => ({ id }))),
        deleteMany: jest.fn().mockResolvedValue({ count: submissionIds.length }),
      },
      placement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new CandidatesService(
      prisma as unknown as ExtendedPrismaClient,
      {} as unknown as PrismaService,
    );
    return { prisma, service };
  }

  it('cascades to placements + submissions, then deletes the candidate', async () => {
    const { prisma, service } = setup(['s1', 's2']);
    await service.remove('c1', makeUser());

    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['s1', 's2'] } },
    });
    expect(prisma.candidateSubmission.deleteMany).toHaveBeenCalledWith({
      where: { candidateId: 'c1' },
    });
    expect(prisma.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    // parent is removed last
    const placementOrder = prisma.placement.deleteMany.mock.invocationCallOrder[0];
    const candidateOrder = prisma.candidate.delete.mock.invocationCallOrder[0];
    expect(candidateOrder).toBeGreaterThan(placementOrder);
  });

  it('skips the child cascade when there are no submissions', async () => {
    const { prisma, service } = setup([]);
    await service.remove('c1', makeUser());

    expect(prisma.placement.deleteMany).not.toHaveBeenCalled();
    expect(prisma.candidateSubmission.deleteMany).not.toHaveBeenCalled();
    expect(prisma.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});

describe('CandidatesService.restore', () => {
  function setup(existing: unknown) {
    const prisma = {
      candidate: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'c1', contactHistory: [], industry: null, roleType: null, specializations: [] }),
      },
    };
    const base = { candidate: { findUnique: jest.fn().mockResolvedValue(existing) } };
    const service = new CandidatesService(
      prisma as unknown as ExtendedPrismaClient,
      base as unknown as PrismaService,
    );
    return { prisma, base, service };
  }

  it('clears deletedAt/deletedById on a soft-deleted candidate', async () => {
    const { prisma, service } = setup({ id: 'c1', deletedAt: new Date() });
    await service.restore('c1');
    expect(prisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: null, deletedById: null },
      include: expect.any(Object),
    });
  });

  it('rejects restoring a candidate that is not deleted', async () => {
    const { prisma, service } = setup({ id: 'c1', deletedAt: null });
    await expect(service.restore('c1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.candidate.update).not.toHaveBeenCalled();
  });

  it('404s when the candidate does not exist', async () => {
    const { service } = setup(null);
    await expect(service.restore('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CandidatesService.purge', () => {
  it('writes a HARD_DELETE audit row then physically deletes via the base client', async () => {
    const base = {
      candidate: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c1' }),
        delete: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new CandidatesService(
      {} as unknown as ExtendedPrismaClient,
      base as unknown as PrismaService,
    );

    await service.purge('c1');

    expect(base.auditLog.create).toHaveBeenCalledTimes(1);
    expect(base.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'HARD_DELETE',
      entityType: 'Candidate',
      entityId: 'c1',
    });
    expect(base.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('404s when the candidate does not exist', async () => {
    const base = {
      candidate: { findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new CandidatesService(
      {} as unknown as ExtendedPrismaClient,
      base as unknown as PrismaService,
    );
    await expect(service.purge('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(base.candidate.delete).not.toHaveBeenCalled();
  });
});

describe('CandidatesService.findAll (where-clause construction)', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { candidate: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new CandidatesService(prisma, {} as unknown as PrismaService);
    return { findMany, count, service };
  }

  it('combines FK/array filters as AND-ed `in` clauses', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({
        statuses: [CandidateStatus.WARM, CandidateStatus.HOT],
        industryIds: ['ind1'],
        specializationIds: [],
        locationIds: [],
        roleTypeIds: ['role1'],
        specializationIds: ['spec1'],
        consultantIds: ['cons1'],
      }),
      makeUser(),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { status: { in: [CandidateStatus.WARM, CandidateStatus.HOT] } },
        { industryId: { in: ['ind1'] } },
        { roleTypeId: { in: ['role1'] } },
        { specializations: { some: { specializationId: { in: ['spec1'] } } } },
        { consultantId: { in: ['cons1'] } },
      ]),
    );
  });

  it('OR-matches any selected skill via JSON array_contains', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ skills: ['CNC', 'Welding'] }),
      makeUser(),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [{ skills: { array_contains: ['CNC'] } }, { skills: { array_contains: ['Welding'] } }],
    });
  });

  it('filters by submission and placement status through the submissions relation', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({
        submissionStatuses: [SubmissionStatus.INTERVIEWING],
        placementStatuses: [PlacementStatus.ACTIVE],
      }),
      makeUser(),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { submissions: { some: { status: { in: [SubmissionStatus.INTERVIEWING] } } } },
        { submissions: { some: { placement: { status: { in: [PlacementStatus.ACTIVE] } } } } },
      ]),
    );
  });

  it('filters lastContactedAt by the given from/to range', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ lastContactedFrom: '2026-01-01', lastContactedTo: '2026-06-30' }),
      makeUser(),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      lastContactedAt: { gte: new Date('2026-01-01'), lte: new Date('2026-06-30') },
    });
  });

  it('broadens quick search across scalar columns plus industry/roleType relation names', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ q: 'Sydney' }),
      makeUser(),
    );

    const where = findMany.mock.calls[0][0].where;
    const orClause = where.AND.find((c: Record<string, unknown>) => 'OR' in c);
    expect(orClause.OR).toEqual(
      expect.arrayContaining([
        { industry: { name: { contains: 'Sydney', mode: 'insensitive' } } },
        { roleType: { name: { contains: 'Sydney', mode: 'insensitive' } } },
        { city: { contains: 'Sydney', mode: 'insensitive' } },
      ]),
    );
  });

  it('matches location against city OR country', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ location: 'Sydney' }),
      makeUser(),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { city: { contains: 'Sydney', mode: 'insensitive' } },
        { country: { contains: 'Sydney', mode: 'insensitive' } },
      ],
    });
  });

  it('sorts by status using Postgres enum ordinal order (no CASE expression)', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ sortBy: 'status' as QueryCandidatesDto['sortBy'], sortOrder: SortOrder.asc }),
      makeUser(),
    );

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ status: SortOrder.asc });
  });

  it('produces an empty where when no filters are given', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery(),
      makeUser(),
    );

    expect(findMany.mock.calls[0][0].where).toEqual({});
  });

  it('ANDs an industry scope onto the where for a scoped consultant', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'consultant', industryIds: ['ind1', 'ind2'] }));

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ industryId: { in: ['ind1', 'ind2'] } });
  });

  it('does not add an industry scope for non-consultant roles', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'manager' }));

    expect(findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe('CandidatesService.findOne — job scope', () => {
  function makeService(candidate: unknown) {
    const findUnique = jest.fn().mockResolvedValue(candidate);
    const prisma = { candidate: { findUnique } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new CandidatesService(prisma, base) };
  }

  it('rejects a scoped consultant reaching an out-of-scope candidate directly', async () => {
    const { service } = makeService({
      id: 'c1',
      industryId: 'finance',
      contactHistory: [],
      industry: null,
      roleType: null,
      specializations: [],
    });
    await expect(
      service.findOne('c1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('rejects a scoped consultant reaching an untagged candidate', async () => {
    const { service } = makeService({
      id: 'c1',
      industryId: null,
      contactHistory: [],
      industry: null,
      roleType: null,
      specializations: [],
    });
    await expect(
      service.findOne('c1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('allows a scoped consultant reaching a matching-industry candidate', async () => {
    const { service } = makeService({
      id: 'c1',
      industryId: 'tech',
      contactHistory: [],
      industry: null,
      roleType: null,
      specializations: [],
    });
    await expect(
      service.findOne('c1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).resolves.toMatchObject({ id: 'c1' });
  });
});

describe('CandidatesService.create — industry-first assignment guard', () => {
  function makeService(consultantIndustryRow: unknown = null) {
    const create = jest.fn().mockResolvedValue({
      id: 'c1',
      contactHistory: [],
      industry: null,
      roleType: null,
      specializations: [],
    });
    const consultantIndustry = { findUnique: jest.fn().mockResolvedValue(consultantIndustryRow) };
    const prisma = { candidate: { create }, consultantIndustry } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new CandidatesService(prisma, base), create };
  }

  it('rejects assigning a consultant when no industry is tagged', async () => {
    const { service } = makeService();
    await expect(
      service.create({ fullName: 'Jane', consultantId: 'cons-1' }),
    ).rejects.toMatchObject({ response: { code: 'INDUSTRY_REQUIRED' } });
  });

  it("rejects assigning a consultant whose industries don't include the tagged one", async () => {
    const { service } = makeService(null);
    await expect(
      service.create({ fullName: 'Jane', industryId: 'ind1', consultantId: 'cons-1' }),
    ).rejects.toMatchObject({ response: { code: 'CONSULTANT_INDUSTRY_MISMATCH' } });
  });

  it('allows assigning a consultant whose industries match', async () => {
    const { service, create } = makeService({ consultantId: 'cons-1', industryId: 'ind1' });
    await service.create({ fullName: 'Jane', industryId: 'ind1', consultantId: 'cons-1' });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('CandidatesService.update — bidirectional auto-clear', () => {
  it('clears a now-mismatched consultant when the industry changes without touching consultantId', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'c1',
        industryId: 'ind1',
        consultantId: 'cons-1',
        contactHistory: [],
        industry: null,
        roleType: null,
        specializations: [],
      })
      .mockResolvedValueOnce({ consultantId: 'cons-1' })
      .mockResolvedValueOnce({
        id: 'c1',
        industryId: 'ind2',
        consultantId: null,
        contactHistory: [],
        industry: null,
        roleType: null,
        specializations: [],
      });
    const update = jest.fn().mockResolvedValue({
      id: 'c1',
      industryId: 'ind2',
      contactHistory: [],
      industry: null,
      roleType: null,
      specializations: [],
    });
    const consultantIndustry = { findUnique: jest.fn().mockResolvedValue(null) };
    const prisma = {
      candidate: { findUnique, update, findUniqueOrThrow: findUnique },
      consultantIndustry,
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new CandidatesService(prisma, base);

    const result = await service.update('c1', { industryId: 'ind2' } as never, makeUser());

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { consultantId: null } }),
    );
    expect(result.consultantId).toBeNull();
  });
});
