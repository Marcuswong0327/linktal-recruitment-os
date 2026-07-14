import { StakeholdersService } from './stakeholders.service';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

describe('StakeholdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 's1', displayId: 'Stake-0133', fullName: 'Jane Doe' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const service = new StakeholdersService(prisma);

    const dto: CreateStakeholderDto = { clientId: 'cl1', fullName: 'Jane Doe' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toBe(created);
  });
});
