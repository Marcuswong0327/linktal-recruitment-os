import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

describe('CandidatesService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'c1', displayId: 'CDD-0105', fullName: 'Jane Doe', contactHistory: [] };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { candidate: { create } } as unknown as ExtendedPrismaClient;
    const base = {} as unknown as PrismaService;
    const service = new CandidatesService(prisma, base);

    const dto: CreateCandidateDto = { fullName: 'Jane Doe' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toEqual({
      id: 'c1',
      displayId: 'CDD-0105',
      fullName: 'Jane Doe',
      lastContactType: null,
      lastContactNotes: null,
      lastContactedBy: null,
    });
  });
});

// The extended client rewrites delete()/deleteMany() to soft-deletes, so these
// specs assert the service issues the right *cascade* calls (children first),
// not the physical SQL.
describe('CandidatesService.remove (cascade soft-delete)', () => {
  function setup(submissionIds: string[]) {
    const prisma = {
      candidate: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c1', fullName: 'Jane', contactHistory: [] }),
        delete: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      candidateSubmission: {
        findMany: jest.fn().mockResolvedValue(submissionIds.map((id) => ({ id }))),
        deleteMany: jest.fn().mockResolvedValue({ count: submissionIds.length }),
      },
      placement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new CandidatesService(
      prisma as unknown as ExtendedPrismaClient,
      {} as unknown as PrismaService,
    );
    return { prisma, service };
  }

  it('cascades to placements + submissions, then deletes the candidate', async () => {
    const { prisma, service } = setup(['s1', 's2']);
    await service.remove('c1');

    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['s1', 's2'] } },
    });
    expect(prisma.candidateSubmission.deleteMany).toHaveBeenCalledWith({
      where: { candidateId: 'c1' },
    });
    expect(prisma.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    // parent is removed last
    const placementOrder = prisma.placement.deleteMany.mock.invocationCallOrder[0];
    const candidateOrder = prisma.candidate.delete.mock.invocationCallOrder[0];
    expect(candidateOrder).toBeGreaterThan(placementOrder);
  });

  it('skips the child cascade when there are no submissions', async () => {
    const { prisma, service } = setup([]);
    await service.remove('c1');

    expect(prisma.placement.deleteMany).not.toHaveBeenCalled();
    expect(prisma.candidateSubmission.deleteMany).not.toHaveBeenCalled();
    expect(prisma.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});

describe('CandidatesService.restore', () => {
  function setup(existing: unknown) {
    const prisma = {
      candidate: { update: jest.fn().mockResolvedValue({ id: 'c1', contactHistory: [] }) },
    };
    const base = { candidate: { findUnique: jest.fn().mockResolvedValue(existing) } };
    const service = new CandidatesService(
      prisma as unknown as ExtendedPrismaClient,
      base as unknown as PrismaService,
    );
    return { prisma, base, service };
  }

  it('clears deletedAt/deletedById on a soft-deleted candidate', async () => {
    const { prisma, service } = setup({ id: 'c1', deletedAt: new Date() });
    await service.restore('c1');
    expect(prisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: null, deletedById: null },
      include: expect.any(Object),
    });
  });

  it('rejects restoring a candidate that is not deleted', async () => {
    const { prisma, service } = setup({ id: 'c1', deletedAt: null });
    await expect(service.restore('c1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.candidate.update).not.toHaveBeenCalled();
  });

  it('404s when the candidate does not exist', async () => {
    const { service } = setup(null);
    await expect(service.restore('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CandidatesService.purge', () => {
  it('writes a HARD_DELETE audit row then physically deletes via the base client', async () => {
    const base = {
      candidate: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c1' }),
        delete: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new CandidatesService(
      {} as unknown as ExtendedPrismaClient,
      base as unknown as PrismaService,
    );

    await service.purge('c1');

    expect(base.auditLog.create).toHaveBeenCalledTimes(1);
    expect(base.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'HARD_DELETE',
      entityType: 'Candidate',
      entityId: 'c1',
    });
    expect(base.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('404s when the candidate does not exist', async () => {
    const base = {
      candidate: { findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new CandidatesService(
      {} as unknown as ExtendedPrismaClient,
      base as unknown as PrismaService,
    );
    await expect(service.purge('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(base.candidate.delete).not.toHaveBeenCalled();
  });
});
