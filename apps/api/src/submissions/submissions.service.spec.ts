import { ConflictException, NotFoundException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';

describe('SubmissionsService.create', () => {
  function makeService(opts: {
    candidate?: unknown;
    jobOrder?: unknown;
    existingSubmission?: unknown;
  }) {
    const create = jest.fn().mockResolvedValue({
      id: 'sub1',
      candidate: { fullName: 'Jane' },
      jobOrder: { jobTitle: 'PM' },
    });
    const update = jest.fn().mockResolvedValue({
      id: 'sub1',
      candidate: { fullName: 'Jane' },
      jobOrder: { jobTitle: 'PM' },
    });
    const prisma = {
      candidate: {
        findUnique: jest.fn().mockResolvedValue('candidate' in opts ? opts.candidate : { id: 'c1' }),
      },
      jobOrder: {
        findUnique: jest.fn().mockResolvedValue('jobOrder' in opts ? opts.jobOrder : { id: 'j1' }),
        // Stubbed for recomputeJobOrderCounters, fired after every
        // create/update/remove — not itself under test here.
        update: jest.fn().mockResolvedValue({}),
      },
      candidateSubmission: {
        create,
        update,
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ExtendedPrismaClient;
    const base = {
      candidateSubmission: {
        findUnique: jest.fn().mockResolvedValue(opts.existingSubmission ?? null),
      },
    } as unknown as PrismaService;
    return { service: new SubmissionsService(prisma, base), create, update };
  }

  it('allows a candidate to be submitted to a job order in a different industry', async () => {
    const { service, create } = makeService({});
    await service.create({ candidateId: 'c1', jobOrderId: 'j1' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('404s when the candidate does not exist', async () => {
    const { service } = makeService({ candidate: null });
    await expect(
      service.create({ candidateId: 'missing', jobOrderId: 'j1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the job order does not exist', async () => {
    const { service } = makeService({ jobOrder: null });
    await expect(
      service.create({ candidateId: 'c1', jobOrderId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still rejects a duplicate active submission', async () => {
    const { service } = makeService({
      existingSubmission: { id: 'sub1', deletedAt: null },
    });
    await expect(
      service.create({ candidateId: 'c1', jobOrderId: 'j1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('restores a soft-deleted submission instead of erroring', async () => {
    const { service, update } = makeService({
      existingSubmission: { id: 'sub1', deletedAt: new Date() },
    });
    await service.create({ candidateId: 'c1', jobOrderId: 'j1' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub1' } }),
    );
  });
});
