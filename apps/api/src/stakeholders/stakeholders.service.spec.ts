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
    ...overrides,
  };
}

function baseQuery(overrides: Partial<QueryStakeholdersDto> = {}): QueryStakeholdersDto {
  return { page: 1, pageSize: 20, sortOrder: SortOrder.asc, ...overrides } as QueryStakeholdersDto;
}

describe('StakeholdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it), auto-classifies roleType from jobTitle, and returns the row', async () => {
    const created = {
      id: 's1',
      displayId: 'Stake-0133',
      fullName: 'Jane Doe',
      client: { companyName: 'Acme Corp' },
      roleType: { name: 'HR' },
      contactHistory: [],
    };
    const create = jest.fn().mockResolvedValue(created);
    const upsert = jest.fn().mockResolvedValue({ id: 'rt1', name: 'HR' });
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const base = { stakeholderRoleType: { upsert } } as unknown as PrismaService;
    const service = new StakeholdersService(prisma, base);

    const dto: CreateStakeholderDto = {
      clientId: 'cl1',
      fullName: 'Jane Doe',
      jobTitle: 'Head of HR',
    };
    const result = await service.create(dto);

    expect(upsert).toHaveBeenCalledWith({
      where: { name: 'HR' },
      create: { name: 'HR' },
      update: {},
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(create.mock.calls[0][0].data.roleTypeId).toBe('rt1');
    expect(result).toEqual({
      id: 's1',
      displayId: 'Stake-0133',
      fullName: 'Jane Doe',
      companyName: 'Acme Corp',
      roleType: 'HR',
      lastContactType: null,
      lastContactNotes: null,
      lastContactedBy: null,
    });
  });

  it('leaves roleTypeId untouched when the caller explicitly sets it', async () => {
    const created = {
      id: 's1',
      displayId: 'Stake-0133',
      fullName: 'Jane Doe',
      client: { companyName: 'Acme Corp' },
      roleType: { name: 'Finance' },
      contactHistory: [],
    };
    const create = jest.fn().mockResolvedValue(created);
    const upsert = jest.fn();
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const base = { stakeholderRoleType: { upsert } } as unknown as PrismaService;
    const service = new StakeholdersService(prisma, base);

    const dto: CreateStakeholderDto = {
      clientId: 'cl1',
      fullName: 'Jane Doe',
      jobTitle: 'Head of HR',
      roleTypeId: 'rt-finance',
    };
    await service.create(dto);

    expect(upsert).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].data.roleTypeId).toBe('rt-finance');
  });
});

describe('StakeholdersService.findAll — industry scope via parent Client', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { stakeholder: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new StakeholdersService(prisma, {} as unknown as PrismaService);
    return { findMany, service };
  }

  it("ANDs the industry scope (via the parent Client) with the free-text search instead of clobbering it", async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ q: 'jane' }),
      makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: expect.any(Array) },
      { client: { industryId: { in: ['ind1'] } } },
    ]);
  });

  it('does not add an industry scope for non-consultant roles', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'manager' }));
    expect(findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe('StakeholdersService.findOne — job scope', () => {
  function makeService(stakeholder: unknown) {
    const findUnique = jest.fn().mockResolvedValue(stakeholder);
    const prisma = { stakeholder: { findUnique } } as unknown as ExtendedPrismaClient;
    return { service: new StakeholdersService(prisma, {} as unknown as PrismaService) };
  }

  it("rejects a scoped consultant reaching a stakeholder whose parent Client is out of scope", async () => {
    const { service } = makeService({
      id: 's1',
      client: { companyName: 'Acme', industryId: 'finance' },
      roleType: null,
      contactHistory: [],
    });
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('rejects a scoped consultant reaching a stakeholder whose parent Client is untagged', async () => {
    const { service } = makeService({
      id: 's1',
      client: { companyName: 'Acme', industryId: null },
      roleType: null,
      contactHistory: [],
    });
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it('allows a scoped consultant reaching a stakeholder whose parent Client matches', async () => {
    const { service } = makeService({
      id: 's1',
      client: { companyName: 'Acme', industryId: 'tech' },
      roleType: null,
      contactHistory: [],
    });
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).resolves.toMatchObject({ id: 's1' });
  });

  it('never restricts non-consultant roles', async () => {
    const { service } = makeService({
      id: 's1',
      client: { companyName: 'Acme', industryId: 'finance' },
      roleType: null,
      contactHistory: [],
    });
    await expect(
      service.findOne('s1', makeUser({ roleName: 'admin' })),
    ).resolves.toMatchObject({ id: 's1' });
  });
});
