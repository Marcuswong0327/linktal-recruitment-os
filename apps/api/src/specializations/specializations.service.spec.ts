import { SpecializationsService } from './specializations.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    specialization: {
      findMany: jest.fn<Promise<{ id: string; name: string }[]>, [unknown]>().mockResolvedValue([]),
    },
  };
}

describe('SpecializationsService', () => {
  describe('findAll', () => {
    it('always excludes deactivated rows', async () => {
      const prisma = makePrisma();
      const service = new SpecializationsService(prisma as unknown as PrismaService);

      await service.findAll();

      expect(prisma.specialization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('narrows by industryIds when given', async () => {
      const prisma = makePrisma();
      const service = new SpecializationsService(prisma as unknown as PrismaService);

      await service.findAll({ industryIds: ['ind1', 'ind2'] });

      expect(prisma.specialization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, industryId: { in: ['ind1', 'ind2'] } },
        }),
      );
    });

    it('omits the industryId filter when industryIds is empty', async () => {
      const prisma = makePrisma();
      const service = new SpecializationsService(prisma as unknown as PrismaService);

      await service.findAll({ industryIds: [] });

      expect(prisma.specialization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('combines q, take and industryIds together', async () => {
      const prisma = makePrisma();
      const service = new SpecializationsService(prisma as unknown as PrismaService);

      await service.findAll({ q: 'bak', take: 50, industryIds: ['ind1'] });

      // Two passes, prefix matches first — see rankedNameSearch.
      expect(prisma.specialization.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          isActive: true,
          name: { startsWith: 'bak', mode: 'insensitive' },
          industryId: { in: ['ind1'] },
        },
        orderBy: { name: 'asc' },
        take: 50,
      });
      expect(prisma.specialization.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          isActive: true,
          name: { contains: 'bak', mode: 'insensitive' },
          NOT: { name: { startsWith: 'bak', mode: 'insensitive' } },
          industryId: { in: ['ind1'] },
        },
        orderBy: { name: 'asc' },
        take: 50,
      });
    });

    it('returns prefix matches ahead of mid-word ones', async () => {
      const prisma = makePrisma();
      prisma.specialization.findMany
        .mockResolvedValueOnce([{ id: '1', name: 'Tools Manufacturing' }])
        .mockResolvedValueOnce([{ id: '2', name: 'Engineering Parts Hardware tools' }]);
      const service = new SpecializationsService(prisma as unknown as PrismaService);

      const rows = await service.findAll({ q: 'Tools', take: 10 });

      expect(rows.map((r) => r.name)).toEqual([
        'Tools Manufacturing',
        'Engineering Parts Hardware tools',
      ]);
    });

    it('skips the second pass once the cap is filled by prefix matches', async () => {
      const prisma = makePrisma();
      prisma.specialization.findMany.mockResolvedValueOnce([
        { id: '1', name: 'Bank' },
        { id: '2', name: 'Banking Ops' },
      ]);
      const service = new SpecializationsService(prisma as unknown as PrismaService);

      await service.findAll({ q: 'Ban', take: 2 });

      expect(prisma.specialization.findMany).toHaveBeenCalledTimes(1);
    });

    it('only backfills the remainder of the cap on the second pass', async () => {
      const prisma = makePrisma();
      prisma.specialization.findMany.mockResolvedValueOnce([{ id: '1', name: 'Bank' }]);
      const service = new SpecializationsService(prisma as unknown as PrismaService);

      await service.findAll({ q: 'Ban', take: 5 });

      expect(prisma.specialization.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ take: 4 }),
      );
    });
  });
});
