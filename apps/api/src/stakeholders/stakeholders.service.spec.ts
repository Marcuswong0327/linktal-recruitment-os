import { StakeholdersService } from './stakeholders.service';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { QueryStakeholdersDto, SortOrder } from './dto/query-stakeholders.dto';
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

function baseQuery(overrides: Partial<QueryStakeholdersDto> = {}): QueryStakeholdersDto {
  return { page: 1, pageSize: 20, sortOrder: SortOrder.asc, ...overrides } as QueryStakeholdersDto;
}

/** The relation keys STAKEHOLDER_INCLUDE pulls in — `toEntity` destructures all of them. */
function withRelations(row: Record<string, unknown> = {}) {
  return {
    client: null,
    jobTitle: null,
    stakeholderRoleType: null,
    coverage: [],
    contactHistory: [],
    ...row,
  };
}

/**
 * Base client stub: the StakeholderRoleType catalog upsert, plus the JobTitle
 * *read* the keyword classifier needs (titles arrive as ids, classification
 * reads words). Nothing here creates a JobTitle — that goes through
 * /job-titles.
 */
function makeBase(roleTypeId = 'rt1', roleTypeName = 'HR', jobTitleName: string | null = 'Head of HR') {
  const roleTypeUpsert = jest.fn().mockResolvedValue({ id: roleTypeId, name: roleTypeName });
  const jobTitleFindUnique = jest
    .fn()
    .mockResolvedValue(jobTitleName === null ? null : { name: jobTitleName });
  return {
    base: {
      stakeholderRoleType: { upsert: roleTypeUpsert },
      jobTitle: { findUnique: jobTitleFindUnique },
    } as unknown as PrismaService,
    roleTypeUpsert,
    jobTitleFindUnique,
  };
}

describe('StakeholdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it), auto-classifies roleType from jobTitle, and returns the row', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({
        id: 's1',
        displayId: 'Stake-0133',
        firstName: 'Jane',
        lastName: 'Doe',
        client: { companyName: 'Acme Corp' },
        jobTitle: { name: 'Head of HR' },
        stakeholderRoleType: { name: 'HR' },
      }),
    );
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, roleTypeUpsert } = makeBase();
    const service = new StakeholdersService(prisma, base);

    const dto: CreateStakeholderDto = {
      clientId: 'cl1',
      firstName: 'Jane',
      lastName: 'Doe',
      jobTitleId: 'jt-1',
    };
    const result = await service.create(dto, makeUser());

    expect(roleTypeUpsert).toHaveBeenCalledWith({
      where: { name: 'HR' },
      create: { name: 'HR' },
      update: {},
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(create.mock.calls[0][0].data.stakeholderRoleTypeId).toBe('rt1');
    expect(result).toEqual({
      id: 's1',
      displayId: 'Stake-0133',
      firstName: 'Jane',
      lastName: 'Doe',
      companyName: 'Acme Corp',
      jobTitle: 'Head of HR',
      roleType: 'HR',
      coverage: [],
      coverageLocationIds: [],
      lastContactType: null,
      lastContactCategory: null,
      lastContactNotes: null,
      lastContactedBy: null,
    });
  });

  // The catalog is read, never grown here — a title new to the catalog is
  // created through /job-titles first.
  it('passes the jobTitleId through and only reads the catalog to classify', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, jobTitleFindUnique } = makeBase('rt1', 'HR', 'Head of Talent');
    const service = new StakeholdersService(prisma, base);

    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1' }, makeUser());

    expect(jobTitleFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'jt-1' } }),
    );
    expect(create.mock.calls[0][0].data.jobTitleId).toBe('jt-1');
    expect(create.mock.calls[0][0].data).not.toHaveProperty('jobTitle');
  });

  // Classification reads the catalog row's words, so an unset title (or one
  // whose row has vanished) falls back to "Other" rather than throwing.
  it('classifies an unset job title as Other', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, roleTypeUpsert, jobTitleFindUnique } = makeBase('rt-other', 'Other');
    const service = new StakeholdersService(prisma, base);

    await service.create({ clientId: 'cl1' }, makeUser());

    expect(jobTitleFindUnique).not.toHaveBeenCalled();
    expect(roleTypeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Other' } }),
    );
    expect(create.mock.calls[0][0].data.stakeholderRoleTypeId).toBe('rt-other');
  });

  it('leaves the role type untouched when the caller explicitly sets it', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, roleTypeUpsert } = makeBase();
    const service = new StakeholdersService(prisma, base);

    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1', roleTypeId: 'rt-finance' }, makeUser());

    expect(roleTypeUpsert).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].data.stakeholderRoleTypeId).toBe('rt-finance');
  });

  it('nests coverageLocationIds as a create on the join relation', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const service = new StakeholdersService(prisma, makeBase().base);

    await service.create({ clientId: 'cl1', coverageLocationIds: ['syd', 'mel'] }, makeUser());

    expect(create.mock.calls[0][0].data.coverage).toEqual({
      create: [{ locationId: 'syd' }, { locationId: 'mel' }],
    });
  });

  // Create/update no longer check whether the destination client is in the
  // caller's own scope — scope is a pure list filter now (see
  // common/scope.ts), so a consultant can write a contact against any client,
  // in or out of their own patch.
  it('creates against a client the caller has no grants for at all', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const service = new StakeholdersService(prisma, makeBase().base);

    await service.create(
      { clientId: 'cl1' },
      makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('StakeholdersService.update', () => {
  function setup() {
    const findUnique = jest.fn().mockResolvedValue(withRelations({ id: 's1', client: { companyName: 'Acme' } }));
    const update = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { findUnique, update } } as unknown as ExtendedPrismaClient;
    return { service: new StakeholdersService(prisma, makeBase().base), update };
  }

  it('re-parents to a different client with no scope check', async () => {
    const { service, update } = setup();
    await service.update(
      's1',
      { clientId: 'cl2' },
      makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('replaces the whole coverage set rather than merging into it', async () => {
    const { service, update } = setup();
    await service.update('s1', { coverageLocationIds: ['bne'] }, makeUser());
    expect(update.mock.calls[0][0].data.coverage).toEqual({
      deleteMany: {},
      create: [{ locationId: 'bne' }],
    });
  });
});

// A stakeholder is visible exactly when its client is — stakeholderScope is
// `{ client: clientScope(user) }`, full stop. No separate coverage arm.
describe('StakeholdersService.findAll — scope', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { stakeholder: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new StakeholdersService(prisma, makeBase().base);
    return { findMany, service };
  }

  it('ANDs the scope with the free-text search instead of clobbering it', async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ q: 'jane' }),
      makeUser({
        roleName: 'consultant',
        consultantId: 'me',
        industryIds: ['ind1'],
        locationIds: ['nsw'],
      }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: expect.any(Array) },
      {
        client: {
          OR: [
            { industryId: { in: ['ind1'] } },
            { locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
            { jobOrders: { some: { deletedAt: null, consultants: { some: { consultantId: 'me' } } } } },
          ],
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

// findOne no longer gates on scope — it's a plain existence check now.
describe('StakeholdersService.findOne', () => {
  function makeService(stakeholder: unknown) {
    const findUnique = jest.fn().mockResolvedValue(stakeholder);
    const prisma = { stakeholder: { findUnique } } as unknown as ExtendedPrismaClient;
    return { service: new StakeholdersService(prisma, makeBase().base) };
  }

  it('returns the record for a scoped consultant even when its client is out of scope', async () => {
    const { service } = makeService(
      withRelations({ id: 's1', client: { companyName: 'Acme' } }),
    );
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 's1' });
  });

  it('throws NotFound when the stakeholder does not exist', async () => {
    const { service } = makeService(null);
    await expect(
      service.findOne('missing', makeUser({ roleName: 'consultant' })),
    ).rejects.toThrow('Stakeholder missing not found');
  });
});
