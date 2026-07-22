import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';

describe('SubmissionsService.create — industry guard', () => {
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
        findUnique: jest
          .fn()
          .mockResolvedValue('candidate' in opts ? opts.candidate : { industryId: 'ind1' }),
      },
      jobOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValue('jobOrder' in opts ? opts.jobOrder : { client: { industryId: 'ind1' } }),
      },
      candidateSubmission: { create, update },
    } as unknown as ExtendedPrismaClient;
    const base = {
      candidateSubmission: {
        findUnique: jest.fn().mockResolvedValue(opts.existingSubmission ?? null),
      },
    } as unknown as PrismaService;
    return { service: new SubmissionsService(prisma, base), create, update };
  }

  it('rejects when the candidate has no industry tagged', async () => {
    const { service } = makeService({ candidate: { industryId: null } });
    await expect(
      service.create({ candidateId: 'c1', jobOrderId: 'j1' }),
    ).rejects.toMatchObject({ response: { code: 'SUBMISSION_INDUSTRY_MISMATCH' } });
  });

  it('rejects when the job order\'s client has no industry tagged', async () => {
    const { service } = makeService({ jobOrder: { client: { industryId: null } } });
    await expect(
      service.create({ candidateId: 'c1', jobOrderId: 'j1' }),
    ).rejects.toMatchObject({ response: { code: 'SUBMISSION_INDUSTRY_MISMATCH' } });
  });

  it('rejects when the candidate and job order industries differ', async () => {
    const { service } = makeService({
      candidate: { industryId: 'tech' },
      jobOrder: { client: { industryId: 'finance' } },
    });
    await expect(
      service.create({ candidateId: 'c1', jobOrderId: 'j1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a matching pair', async () => {
    const { service, create } = makeService({
      candidate: { industryId: 'tech' },
      jobOrder: { client: { industryId: 'tech' } },
    });
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

  it('still rejects a duplicate active submission for a matching pair', async () => {
    const { service } = makeService({
      candidate: { industryId: 'tech' },
      jobOrder: { client: { industryId: 'tech' } },
      existingSubmission: { id: 'sub1', deletedAt: null },
    });
    await expect(
      service.create({ candidateId: 'c1', jobOrderId: 'j1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('restores a soft-deleted submission for a matching pair instead of erroring', async () => {
    const { service, update } = makeService({
      candidate: { industryId: 'tech' },
      jobOrder: { client: { industryId: 'tech' } },
      existingSubmission: { id: 'sub1', deletedAt: new Date() },
    });
    await service.create({ candidateId: 'c1', jobOrderId: 'j1' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub1' } }),
    );
  });
});
