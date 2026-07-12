import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from './rbac.service';

const role = { name: 'consultant', permissions: [] };

function consultant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    azureId: 'azure-oid-1',
    email: 'a@b.com',
    fullName: 'A B',
    isActive: true,
    role,
    ...overrides,
  };
}

function prismaWith(consultantRow: ReturnType<typeof consultant> | null) {
  return {
    consultant: {
      findUnique: jest.fn().mockResolvedValue(consultantRow),
    },
  } as unknown as PrismaService;
}

describe('RbacService', () => {
  it('resolveUser succeeds for an active consultant', async () => {
    const service = new RbacService(prismaWith(consultant()));
    const user = await service.resolveUser({ sub: 'azure-oid-1', email: 'a@b.com' });
    expect(user.consultantId).toBe('c1');
  });

  it('resolveUser rejects a deactivated consultant', async () => {
    const service = new RbacService(prismaWith(consultant({ isActive: false })));
    await expect(
      service.resolveUser({ sub: 'azure-oid-1', email: 'a@b.com' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('resolveById succeeds for an active consultant', async () => {
    const service = new RbacService(prismaWith(consultant()));
    const user = await service.resolveById('c1');
    expect(user.consultantId).toBe('c1');
  });

  it('resolveById rejects a deactivated consultant', async () => {
    const service = new RbacService(prismaWith(consultant({ isActive: false })));
    await expect(service.resolveById('c1')).rejects.toThrow(ForbiddenException);
  });
});
