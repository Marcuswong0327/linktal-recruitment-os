import { JobOrdersService } from './job-orders.service';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

describe('JobOrdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'j1', displayId: 'JO-0069', jobTitle: 'Production Manager' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { jobOrder: { create } } as unknown as ExtendedPrismaClient;
    const service = new JobOrdersService(prisma);

    const dto: CreateJobOrderDto = { clientId: 'cl1', jobTitle: 'Production Manager' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toBe(created);
  });
});

describe('JobOrdersService.remove (cascade soft-delete)', () => {
  it('cascades to its submissions + their placements, then deletes the job order', async () => {
    const prisma = {
      jobOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: 'j1', jobTitle: 'PM' }),
        delete: jest.fn().mockResolvedValue({ id: 'j1' }),
      },
      candidateSubmission: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      placement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new JobOrdersService(prisma as unknown as ExtendedPrismaClient);

    await service.remove('j1');

    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['s1', 's2'] } },
    });
    expect(prisma.candidateSubmission.deleteMany).toHaveBeenCalledWith({
      where: { jobOrderId: 'j1' },
    });
    expect(prisma.jobOrder.delete).toHaveBeenCalledWith({ where: { id: 'j1' } });
  });
});
