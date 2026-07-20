import { NotFoundException } from '@nestjs/common';
import { CandidateSavedSearchesService } from './candidate-saved-searches.service';
import { PrismaService } from '../../prisma/prisma.service';

function setup() {
  const prisma = {
    candidateSavedSearch: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new CandidateSavedSearchesService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('CandidateSavedSearchesService', () => {
  it('lists only the calling consultant\'s own saved searches', async () => {
    const { prisma, service } = setup();
    prisma.candidateSavedSearch.findMany.mockResolvedValue([]);

    await service.findAllForConsultant('cons1');

    expect(prisma.candidateSavedSearch.findMany).toHaveBeenCalledWith({
      where: { consultantId: 'cons1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('creates a saved search attributed to the given consultant', async () => {
    const { prisma, service } = setup();
    prisma.candidateSavedSearch.create.mockResolvedValue({ id: 's1' });

    await service.create('cons1', { name: 'IT Sydney', filters: { q: 'Sydney' } });

    expect(prisma.candidateSavedSearch.create).toHaveBeenCalledWith({
      data: { name: 'IT Sydney', consultantId: 'cons1', filters: { q: 'Sydney' } },
    });
  });

  it('deletes a saved search owned by the caller', async () => {
    const { prisma, service } = setup();
    prisma.candidateSavedSearch.findUnique.mockResolvedValue({ id: 's1', consultantId: 'cons1' });
    prisma.candidateSavedSearch.delete.mockResolvedValue({ id: 's1' });

    await service.remove('s1', 'cons1');

    expect(prisma.candidateSavedSearch.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('404s deleting a saved search that does not exist', async () => {
    const { prisma, service } = setup();
    prisma.candidateSavedSearch.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing', 'cons1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.candidateSavedSearch.delete).not.toHaveBeenCalled();
  });

  it("404s deleting a saved search owned by someone else (doesn't leak existence)", async () => {
    const { prisma, service } = setup();
    prisma.candidateSavedSearch.findUnique.mockResolvedValue({ id: 's1', consultantId: 'someone-else' });

    await expect(service.remove('s1', 'cons1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.candidateSavedSearch.delete).not.toHaveBeenCalled();
  });
});
