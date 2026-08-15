import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

// locationId + industryId are required columns now, so every valid DTO carries
// them — the scope resolver can't work without either (see the SCOPING note in
// schema.prisma).
function makeDto(overrides: Partial<CreateCandidateDto> = {}): CreateCandidateDto {
  return { firstName: 'Jane', lastName: 'Doe', locationId: 'loc1', industryId: 'ind1', ...overrides };
}

/** The relation keys CANDIDATE_INCLUDE pulls in — `toEntity` destructures all of them. */
function withRelations(row: Record<string, unknown> = {}) {
  return {
    contactHistory: [],
    industry: null,
    jobRoleType: null,
    location: null,
    specializations: [],
    ...row,
  };
}

describe('CandidatesService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({ id: 'c1', displayId: 'CDD-0105', firstName: 'Jane', lastName: 'Doe' }),
    );
    const prisma = { candidate: { create } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new CandidatesService(prisma, base);

    const result = await service.create(makeDto(), makeUser());

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toEqual({
      id: 'c1',
      displayId: 'CDD-0105',
      firstName: 'Jane',
      lastName: 'Doe',
      industry: null,
      jobRoleType: null,
      location: null,
      locationLevel: null,
      specializations: [],
      specializationIds: [],
      lastContactType: null,
      lastContactCategory: null,
      lastContactNotes: null,
      lastContactedBy: null,
      lastContactDate: null,
    });
  });

  it('nests specializationIds as a create on the join relation', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'c1' }));
    const prisma = { candidate: { create } } as unknown as ExtendedPrismaClient;
    const service = new CandidatesService(prisma, {} as unknown as PrismaService);

    await service.create(makeDto({ specializationIds: ['spec1', 'spec2'] }), makeUser());

    expect(create.mock.calls[0][0].data.specializations).toEqual({
      create: [{ specializationId: 'spec1' }, { specializationId: 'spec2' }],
    });
  });
});

// Cascading to submissions (and their placements) is no longer this service's
// job — it's handled centrally by the Prisma extension's CASCADE_MAP for any
// delete path, not just this one. See prisma.extensions.spec.ts.
describe('CandidatesService.remove', () => {
  it('checks existence, then hands off to a plain delete', async () => {
    const prisma = {
      candidate: {
        findUnique: jest.fn().mockResolvedValue(withRelations({ id: 'c1', industryId: 'ind1' })),
        delete: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
    };
    const service = new CandidatesService(
      prisma as unknown as ExtendedPrismaClient,
      {} as unknown as PrismaService,
    );

    await service.remove('c1', makeUser());

    expect(prisma.candidate.findUnique).toHaveBeenCalled();
    expect(prisma.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});

describe('CandidatesService.restore', () => {
  function setup(existing: unknown) {
    const prisma = {
      candidate: { update: jest.fn().mockResolvedValue(withRelations({ id: 'c1' })) },
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
        statuses: [CandidateStatus.WARM, CandidateStatus.PLACED],
        industryIds: ['ind1'],
        jobRoleTypeIds: ['role1'],
        specializationIds: ['spec1'],
      }),
      makeUser(),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { status: { in: [CandidateStatus.WARM, CandidateStatus.PLACED] } },
        { industryId: { in: ['ind1'] } },
        { jobRoleTypeId: { in: ['role1'] } },
        { specializations: { some: { specializationId: { in: ['spec1'] } } } },
      ]),
    );
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

  it('broadens quick search across scalar columns plus location/industry/jobRoleType relation names', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery({ q: 'Sydney' }), makeUser());

    const where = findMany.mock.calls[0][0].where;
    const orClause = where.AND.find((c: Record<string, unknown>) => 'OR' in c);
    expect(orClause.OR).toEqual(
      expect.arrayContaining([
        { firstName: { contains: 'Sydney', mode: 'insensitive' } },
        { lastName: { contains: 'Sydney', mode: 'insensitive' } },
        { location: { name: { contains: 'Sydney', mode: 'insensitive' } } },
        { industry: { name: { contains: 'Sydney', mode: 'insensitive' } } },
        { jobRoleType: { name: { contains: 'Sydney', mode: 'insensitive' } } },
      ]),
    );
  });

  it("matches a free-text location against the node's own name", async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery({ location: 'Sydney' }), makeUser());

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      location: { name: { contains: 'Sydney', mode: 'insensitive' } },
    });
  });

  // A selected node covers everything beneath it. That's resolved through the
  // record's denormalized ancestor path, never by expanding the selection
  // downward — one COUNTRY node covers 1,500+ descendants today.
  it('matches locationIds against the candidate location ancestor path', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery({ locationIds: ['au', 'nsw'] }), makeUser());

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ location: { ancestorIds: { hasSome: ['au', 'nsw'] } } });
  });

  it('sorts by status using Postgres enum ordinal order (no CASE expression)', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ sortBy: 'status' as QueryCandidatesDto['sortBy'], sortOrder: SortOrder.asc }),
      makeUser(),
    );

    // `id` tags along as a tiebreaker on every sort — see CandidatesService.
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ status: SortOrder.asc }, { id: 'asc' }]);
  });

  it('produces an empty where when no filters are given', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser());

    expect(findMany.mock.calls[0][0].where).toEqual({});
  });
});

// visible = industry OR own location OR reach via a job order I'm on — three
// arms OR-ed, so any one alone is enough to reach a record. Pure list filter,
// no ownership arm.
describe('CandidatesService.findAll — scope', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { candidate: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { findMany, service: new CandidatesService(prisma, {} as unknown as PrismaService) };
  }

  it('ORs industry, location and job-order-membership onto the where for a scoped consultant', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery(),
      makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['ind1', 'ind2'], locationIds: ['nsw'] }),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { industryId: { in: ['ind1', 'ind2'] } },
        { location: { ancestorIds: { hasSome: ['nsw'] } } },
        {
          submissions: {
            some: { deletedAt: null, jobOrder: { consultants: { some: { consultantId: 'cons-me' } } } },
          },
        },
      ],
    });
  });

  // A Candidate holds a *set* of specializations and has no `specializationId`
  // column, so this arm is spelled with the join — `none: {}` is its
  // "unspecialised", the counterpart to Client's `specializationId: null`.
  // Asserting the Client spelling here is what previously hid a live 500: a
  // mocked Prisma delegate accepts any object, so the invalid `where` only
  // failed against the real database.
  it('narrows the industry arm by specialization, letting unspecialised records through', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery(),
      makeUser({ roleName: 'consultant', industryIds: ['ind1'], specializationIds: ['food'] }),
    );

    const where = findMany.mock.calls[0][0].where;
    const scope = where.AND.find((c: Record<string, unknown>) => 'OR' in c);
    expect(scope.OR[0]).toEqual({
      industryId: { in: ['ind1'] },
      OR: [
        { specializations: { none: {} } },
        { specializations: { some: { specialization: { ancestorIds: { hasSome: ['food'] } } } } },
      ],
    });
  });

  // Zero grants means "not configured", never "sees everything" — the industry
  // and location arms naturally match nothing (`in: []` / `hasSome: []`), and
  // there's no ownership arm left to fall back to. The job-order-membership
  // arm is unaffected by grants, so it's still present.
  it('emits unmatchable industry/location arms but keeps the job-order arm with no grants at all', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'consultant', consultantId: 'cons-me' }));

    const scope = findMany.mock.calls[0][0].where.AND.find((c: Record<string, unknown>) => 'OR' in c);
    expect(scope.OR).toEqual([
      { industryId: { in: [] } },
      { location: { ancestorIds: { hasSome: [] } } },
      {
        submissions: {
          some: { deletedAt: null, jobOrder: { consultants: { some: { consultantId: 'cons-me' } } } },
        },
      },
    ]);
  });

  it('does not scope non-consultant roles', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'manager' }));

    expect(findMany.mock.calls[0][0].where).toEqual({});
  });
});

// findOne no longer gates on scope — scope is a list filter only now (see
// common/scope.ts). A direct fetch by id always succeeds regardless of the
// caller's industry/location grants.
describe('CandidatesService.findOne', () => {
  function makeService(candidate: unknown) {
    const findUnique = jest.fn().mockResolvedValue(candidate);
    const prisma = { candidate: { findUnique } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new CandidatesService(prisma, base) };
  }

  it('returns the record for a scoped consultant even when no arm matches', async () => {
    const { service } = makeService(
      withRelations({
        id: 'c1',
        industryId: 'finance',
        location: { name: 'Perth', level: 'CITY', ancestorIds: ['perth', 'wa', 'au'] },
      }),
    );
    await expect(
      service.findOne('c1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 'c1' });
  });

  it('throws NotFound when the candidate does not exist, for every role', async () => {
    const { service } = makeService(null);
    await expect(
      service.findOne('missing', makeUser({ roleName: 'consultant' })),
    ).rejects.toThrow('Candidate missing not found');
  });
});

describe('CandidatesService.update', () => {
  function makeService(existing: unknown = withRelations({ id: 'c1', industryId: 'ind1' })) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'c1', industryId: 'ind2' }));
    const prisma = { candidate: { findUnique, update } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new CandidatesService(prisma, base), update };
  }

  it('writes the industry change straight through, with no follow-up write', async () => {
    const { service, update } = makeService();
    await service.update('c1', { industryId: 'ind2' }, makeUser());

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { industryId: 'ind2' } }),
    );
  });

  it('replaces the whole specialization set rather than merging into it', async () => {
    const { service, update } = makeService();
    await service.update('c1', { specializationIds: ['spec1'] }, makeUser());

    expect(update.mock.calls[0][0].data.specializations).toEqual({
      deleteMany: {},
      create: [{ specializationId: 'spec1' }],
    });
  });
});

describe('CandidatesService.updateContactHistory', () => {
  function setup(existing: unknown) {
    const update = jest.fn().mockResolvedValue({ id: 'ch1', screeningNotes: 'updated' });
    const prisma = { candidateContactHistory: { update } };
    const base = { candidateContactHistory: { findUnique: jest.fn().mockResolvedValue(existing) } };
    const service = new CandidatesService(
      prisma as unknown as ExtendedPrismaClient,
      base as unknown as PrismaService,
    );
    return { prisma, base, service, update };
  }

  const screeningRow = {
    id: 'ch1',
    candidateId: 'cand1',
    category: 'SCREENING' as const,
    contactedById: 'me',
    editedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  it('updates screeningNotes and stamps editedAt/editedById on a SCREENING row', async () => {
    const { service, update } = setup(screeningRow);
    await service.updateContactHistory('cand1', 'ch1', { screeningNotes: 'new content' }, makeUser({ consultantId: 'me' }));

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: 'ch1' },
      data: expect.objectContaining({ screeningNotes: 'new content', editedById: 'me' }),
    });
  });

  it('rejects editing a non-SCREENING (OUTREACH) row', async () => {
    const { service } = setup({ ...screeningRow, category: 'OUTREACH' });
    await expect(
      service.updateContactHistory('cand1', 'ch1', { screeningNotes: 'x' }, makeUser({ consultantId: 'me' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the row does not exist', async () => {
    const { service } = setup(null);
    await expect(
      service.updateContactHistory('cand1', 'missing', { screeningNotes: 'x' }, makeUser()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the row belongs to a different candidate', async () => {
    const { service } = setup(screeningRow);
    await expect(
      service.updateContactHistory('some-other-candidate', 'ch1', { screeningNotes: 'x' }, makeUser()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects an edit from someone other than the row's author or an admin", async () => {
    const { service } = setup(screeningRow);
    await expect(
      service.updateContactHistory(
        'cand1',
        'ch1',
        { screeningNotes: 'x' },
        makeUser({ consultantId: 'someone-else', roleName: 'consultant' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin edit a row authored by someone else', async () => {
    const { service, update } = setup(screeningRow);
    await service.updateContactHistory(
      'cand1',
      'ch1',
      { screeningNotes: 'x' },
      makeUser({ consultantId: 'someone-else', roleName: 'admin' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale edit whose expectedVersion no longer matches', async () => {
    const { service } = setup(screeningRow);
    await expect(
      service.updateContactHistory(
        'cand1',
        'ch1',
        { screeningNotes: 'x', expectedVersion: '2020-01-01T00:00:00.000Z' },
        makeUser({ consultantId: 'me' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts an edit whose expectedVersion matches editedAt ?? createdAt', async () => {
    const { service, update } = setup(screeningRow);
    await service.updateContactHistory(
      'cand1',
      'ch1',
      { screeningNotes: 'x', expectedVersion: screeningRow.createdAt.toISOString() },
      makeUser({ consultantId: 'me' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});
