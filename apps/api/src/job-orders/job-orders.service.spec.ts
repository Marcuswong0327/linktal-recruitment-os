import { JobOrdersService } from './job-orders.service';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { PrismaService } from '../prisma/prisma.service';

describe('JobOrdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'j1', displayId: 'JO-0069', jobTitle: 'Production Manager' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { jobOrder: { create } } as unknown as PrismaService;
    const service = new JobOrdersService(prisma);

    const dto: CreateJobOrderDto = { clientId: 'cl1', jobTitle: 'Production Manager' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toBe(created);
  });
});
