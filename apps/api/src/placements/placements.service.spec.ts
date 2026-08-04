import { PlacementsService } from './placements.service';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  const submission = {
    id: 'sub1',
    candidateId: 'cand1',
    jobOrder: {
      id: 'jo1',
      clientId: 'client1',
      filledCount: 0,
      openings: 1,
      client: { id: 'client1', guaranteePeriod: 90 },
    },
  };

  return {
    candidateSubmission: {
      findUnique: jest.fn().mockResolvedValue(submission),
      update: jest.fn().mockResolvedValue({}),
    },
    placement: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'plc1', ...data })),
    },
    candidate: { update: jest.fn().mockResolvedValue({}) },
    jobOrder: { update: jest.fn().mockResolvedValue({}) },
    client: { update: jest.fn().mockResolvedValue({}) },
    ...overrides,
  } as unknown as ExtendedPrismaClient;
}

describe('PlacementsService.create — fee calculation', () => {
  it('auto-calculates totalPackage and feeValue for a PERCENTAGE fee', async () => {
    const prisma = buildPrismaMock();
    const service = new PlacementsService(prisma);

    const dto: CreatePlacementDto = {
      submissionId: 'sub1',
      baseSalary: 100000,
      superPercentage: 10,
      feeType: 'PERCENTAGE',
      feePercentage: 15,
    };
    const result = await service.create(dto);

    // Total package: 100000 * 1.10 = 110000; fee: 110000 * 0.15 = 16500
    expect(result.totalPackage).toBe(110000);
    expect(result.feeValue).toBe(16500);
  });

  it('uses the flat feeValue as-is when feeType is FLAT', async () => {
    const prisma = buildPrismaMock();
    const service = new PlacementsService(prisma);

    const result = await service.create({
      submissionId: 'sub1',
      baseSalary: 100000,
      feeType: 'FLAT',
      feeValue: 12000,
    });

    expect(result.feeValue).toBe(12000);
  });

  // guaranteeEndDate is entered by the consultant, never derived: guarantee
  // terms live per-Tob and a client can hold several that disagree, so
  // picking the applicable one automatically would be guesswork.
  it('takes guaranteeEndDate from the caller, not from startDate', async () => {
    const prisma = buildPrismaMock();
    const service = new PlacementsService(prisma);

    const result = await service.create({
      submissionId: 'sub1',
      startDate: '2026-02-01T00:00:00.000Z',
      guaranteeEndDate: '2026-05-02T00:00:00.000Z',
    });

    expect(result.guaranteeEndDate).toEqual(new Date('2026-05-02T00:00:00.000Z'));
  });

  it('leaves guaranteeEndDate null when the caller omits it, even with a startDate', async () => {
    const prisma = buildPrismaMock();
    const service = new PlacementsService(prisma);

    const result = await service.create({
      submissionId: 'sub1',
      startDate: '2026-02-01T00:00:00.000Z',
    });

    expect(result.guaranteeEndDate).toBeNull();
  });

  it('rejects a second placement for the same submission', async () => {
    const prisma = buildPrismaMock({
      placement: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    });
    const service = new PlacementsService(prisma);

    await expect(service.create({ submissionId: 'sub1' })).rejects.toThrow(
      'This submission already has a placement.',
    );
  });
});

describe('PlacementsService.create — auto-updates', () => {
  it('marks the candidate Placed, fills the job order, and trades the client on its first placement', async () => {
    const prisma = buildPrismaMock();
    const service = new PlacementsService(prisma);

    await service.create({ submissionId: 'sub1' });

    expect(prisma.candidateSubmission.update).toHaveBeenCalledWith({
      where: { id: 'sub1' },
      data: { status: 'PLACED' },
    });
    expect(prisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'cand1' },
      data: { status: 'PLACED' },
    });
    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo1' },
      data: { filledCount: 1, status: 'PLACED' }, // openings: 1, so filling 1 flips it Placed
    });
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'client1' },
      data: { status: 'TRADED' },
    });
  });

  it('does not flip the client to Traded if they already have another placement', async () => {
    const prisma = buildPrismaMock({
      placement: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'other-placement' }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'plc1', ...data })),
      },
    });
    const service = new PlacementsService(prisma);

    await service.create({ submissionId: 'sub1' });

    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('does not flip the job order to Placed if openings remain', async () => {
    const prisma = buildPrismaMock();
    (prisma.candidateSubmission.findUnique as jest.Mock).mockResolvedValue({
      id: 'sub1',
      candidateId: 'cand1',
      jobOrder: {
        id: 'jo1',
        clientId: 'client1',
        filledCount: 0,
        openings: 3,
        client: { id: 'client1', guaranteePeriod: 90 },
      },
    });
    const service = new PlacementsService(prisma);

    await service.create({ submissionId: 'sub1' });

    expect(prisma.jobOrder.update).toHaveBeenCalledWith({
      where: { id: 'jo1' },
      data: { filledCount: 1, status: undefined },
    });
  });
});
