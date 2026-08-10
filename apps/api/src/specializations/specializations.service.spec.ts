import { SpecializationsService } from './specializations.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    specialization: {
      findMany: jest.fn().mockResolvedValue([]),
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

      expect(prisma.specialization.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          name: { contains: 'bak', mode: 'insensitive' },
          industryId: { in: ['ind1'] },
        },
        orderBy: { name: 'asc' },
        take: 50,
      });
    });
  });
});
