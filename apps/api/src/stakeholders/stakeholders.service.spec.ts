import { StakeholdersService } from './stakeholders.service';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';

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
