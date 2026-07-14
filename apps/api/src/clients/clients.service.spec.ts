import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

describe('ClientsService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'cl1', displayId: 'Client-0101', companyName: 'Acme Corp' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { client: { create } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new ClientsService(prisma, base);

    const dto: CreateClientDto = { companyName: 'Acme Corp' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toBe(created);
  });
});

describe('ClientsService.remove (cascade soft-delete)', () => {
  it('cascades to job orders + their submissions/placements, stakeholders and research', async () => {
    const prisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cl1', companyName: 'Acme' }),
        delete: jest.fn().mockResolvedValue({ id: 'cl1' }),
      },
      jobOrder: {
        findMany: jest.fn().mockResolvedValue([{ id: 'j1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      candidateSubmission: {
        findMany: jest.fn().mockResolvedValue([{ id: 's1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      placement: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stakeholder: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      clientJobResearch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new ClientsService(
      prisma as unknown as ExtendedPrismaClient,
      {} as unknown as PrismaService,
    );

    await service.remove('cl1');

    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['s1'] } },
    });
    expect(prisma.candidateSubmission.deleteMany).toHaveBeenCalledWith({
      where: { jobOrderId: { in: ['j1'] } },
    });
    expect(prisma.jobOrder.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.stakeholder.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.clientJobResearch.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'cl1' } });
    expect(prisma.client.delete).toHaveBeenCalledWith({ where: { id: 'cl1' } });
    // client (parent) removed after its job orders
    expect(prisma.client.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.jobOrder.deleteMany.mock.invocationCallOrder[0],
    );
  });
});
