import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CandidateStatus, PlacementStatus, SubmissionStatus } from '@prisma/client';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { QueryCandidatesDto, SortOrder } from './dto/query-candidates.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';
import { grantsMock } from '../common/grants.testing';

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

    const result = await service.create(makeDto());

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

    await service.create(makeDto({ specializationIds: ['spec1', 'spec2'] }));

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
        findUnique: jest.fn().mockResolvedValue(withRelations({ id: 'c1', industryId: 'ind1' })),
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
        consultantIds: ['cons1'],
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
        { consultantId: { in: ['cons1'] } },
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

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ status: SortOrder.asc });
  });

  it('produces an empty where when no filters are given', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser());

    expect(findMany.mock.calls[0][0].where).toEqual({});
  });
});

// visible = (industry AND specialization) OR location — the two arms are
// OR-ed, so either one alone is enough to reach a record.
describe('CandidatesService.findAll — scope', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { candidate: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { findMany, service: new CandidatesService(prisma, {} as unknown as PrismaService) };
  }

  it('ORs ownership, industry and location onto the where for a scoped consultant', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery(),
      makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['ind1', 'ind2'], locationIds: ['nsw'] }),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { consultantId: 'cons-me' }, // an assigned candidate is always mine to see
        { industryId: { in: ['ind1', 'ind2'] } },
        { location: { ancestorIds: { hasSome: ['nsw'] } } },
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
    expect(scope.OR[1]).toEqual({
      industryId: { in: ['ind1'] },
      OR: [
        { specializations: { none: {} } },
        { specializations: { some: { specialization: { ancestorIds: { hasSome: ['food'] } } } } },
      ],
    });
  });

  // Zero grants means "not configured", never "sees everything" — wildcards
  // are materialised into concrete rows at assignment time. An assignment is a
  // specific row rather than a wildcard, so an unconfigured consultant still
  // keeps whatever has been handed to them.
  it('falls back to just their assigned candidates when there are no grants at all', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'consultant', consultantId: 'cons-me' }));

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ consultantId: 'cons-me' });
    expect(findMany.mock.calls[0][0].where.AND).not.toContainEqual({ id: { in: [] } });
  });

  it('does not scope non-consultant roles', async () => {
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

  it('rejects a scoped consultant when neither arm matches', async () => {
    const { service } = makeService(
      withRelations({ id: 'c1', industryId: 'finance', location: { name: 'Perth', level: 'CITY', ancestorIds: ['perth', 'wa', 'au'] } }),
    );
    await expect(
      service.findOne('c1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  // Ownership short-circuits both arms: a candidate handed to this consultant
  // stays theirs to open even after the record is retagged out of their patch.
  it('allows the owning consultant through regardless of both arms', async () => {
    const { service } = makeService(
      withRelations({
        id: 'c1',
        industryId: 'finance',
        consultantId: 'cons-me',
        location: { name: 'Perth', level: 'CITY', ancestorIds: ['perth', 'wa', 'au'] },
      }),
    );
    await expect(
      service.findOne(
        'c1',
        makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['tech'], locationIds: ['nsw'] }),
      ),
    ).resolves.toMatchObject({ id: 'c1' });
  });

  it("does not let one consultant through on another's assignment", async () => {
    const { service } = makeService(
      withRelations({ id: 'c1', industryId: 'finance', consultantId: 'someone-else' }),
    );
    await expect(
      service.findOne(
        'c1',
        makeUser({ roleName: 'consultant', consultantId: 'cons-me', industryIds: ['tech'] }),
      ),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('allows a scoped consultant on an industry match alone', async () => {
    const { service } = makeService(
      withRelations({ id: 'c1', industryId: 'tech', location: { name: 'Perth', level: 'CITY', ancestorIds: ['perth', 'wa', 'au'] } }),
    );
    await expect(
      service.findOne('c1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 'c1' });
  });

  // The location arm resolves upward: a STATE grant reaches a candidate
  // pinned to a suburb inside it, because the state is on the suburb's
  // ancestor path.
  it('allows a scoped consultant on a location match alone, via an ancestor', async () => {
    const { service } = makeService(
      withRelations({
        id: 'c1',
        industryId: 'finance',
        location: { name: 'Silverwater', level: 'SUBURB', ancestorIds: ['silverwater', 'sydney', 'nsw', 'au'] },
      }),
    );
    await expect(
      service.findOne('c1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 'c1' });
  });
});

describe('CandidatesService.create — assignment guard (industry OR location)', () => {
  function makeService(grants: Parameters<typeof grantsMock>[0] = {}) {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 'c1' }));
    const prisma = { candidate: { create }, ...grantsMock(grants) } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new CandidatesService(prisma, base), create };
  }

  it('rejects assigning a consultant who covers neither the industry nor the location', async () => {
    const { service, create } = makeService();
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

  it('allows assigning a consultant on location alone', async () => {
    const { service, create } = makeService({ locationIds: ['au'], locationCovers: true });
    await service.create(
      makeDto({ industryId: 'ind1', consultantId: 'cons-1', locationId: 'syd' }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips the guard entirely when no consultant is being assigned', async () => {
    const { service, create } = makeService();
    await service.create(makeDto());
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('CandidatesService.update — bidirectional auto-clear', () => {
  function makeService(grants: Parameters<typeof grantsMock>[0] = {}) {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(withRelations({ id: 'c1', industryId: 'ind1', consultantId: 'cons-1' }))
      // the auto-clear's own re-read of the persisted row
      .mockResolvedValueOnce({ consultantId: 'cons-1', industryId: 'ind2', locationId: 'syd' })
      .mockResolvedValueOnce(withRelations({ id: 'c1', industryId: 'ind2', consultantId: null }));
    const update = jest.fn().mockResolvedValue(withRelations({ id: 'c1', industryId: 'ind2' }));
    const prisma = {
      candidate: { findUnique, update, findUniqueOrThrow: findUnique },
      ...grantsMock(grants),
    } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    return { service: new CandidatesService(prisma, base), update };
  }

  it('clears a now-uncovered consultant when the industry changes without touching consultantId', async () => {
    const { service, update } = makeService();
    const result = await service.update('c1', { industryId: 'ind2' }, makeUser());

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { consultantId: null } }),
    );
    expect(result.consultantId).toBeNull();
  });

  it("leaves the consultant alone when their patch still covers the candidate", async () => {
    const { service, update } = makeService({ locationIds: ['au'], locationCovers: true });
    await service.update('c1', { industryId: 'ind2' }, makeUser());
    expect(update).toHaveBeenCalledTimes(1);
  });

  // A candidate's location is an ownership arm now, so moving them re-checks.
  it('runs the auto-clear when only the location changed', async () => {
    const { service, update } = makeService();
    await service.update('c1', { locationId: 'mel' }, makeUser());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { consultantId: null } }),
    );
  });
});
