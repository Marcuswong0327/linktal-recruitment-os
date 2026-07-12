import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from './rbac.service';

const role = { name: 'consultant', permissions: [] };
const viewerRole = { id: 'role-viewer', name: 'viewer', permissions: [] };
const consultantRoleRow = { id: 'role-consultant', name: 'consultant', permissions: [] };

function consultant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    azureId: 'azure-oid-1',
    passwordHash: null,
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

  describe('verifyPassword', () => {
    it('succeeds with the correct password', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 4);
      const service = new RbacService(prismaWith(consultant({ passwordHash })));
      const user = await service.verifyPassword('a@b.com', 'correct-horse');
      expect(user.consultantId).toBe('c1');
    });

    it('rejects the wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 4);
      const service = new RbacService(prismaWith(consultant({ passwordHash })));
      await expect(service.verifyPassword('a@b.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email', async () => {
      const service = new RbacService(prismaWith(null));
      await expect(service.verifyPassword('nobody@b.com', 'whatever')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an account with no password set (Azure-only)', async () => {
      const service = new RbacService(prismaWith(consultant({ passwordHash: null })));
      await expect(service.verifyPassword('a@b.com', 'whatever')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a deactivated account even with the correct password', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 4);
      const service = new RbacService(prismaWith(consultant({ passwordHash, isActive: false })));
      await expect(service.verifyPassword('a@b.com', 'correct-horse')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('registerWithPassword', () => {
    it('creates a new consultant with the default viewer role', async () => {
      const prisma = {
        consultant: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ ...data, role: viewerRole }),
          ),
        },
        role: { findUnique: jest.fn().mockResolvedValue(viewerRole) },
      } as unknown as PrismaService;
      const service = new RbacService(prisma);

      const user = await service.registerWithPassword({
        email: 'new@b.com',
        password: 'hunter2hunter2',
        fullName: 'New Person',
      });

      expect(user.email).toBe('new@b.com');
      expect(user.roleName).toBe('viewer');
      expect(prisma.consultant.create).toHaveBeenCalled();
    });

    it('links password auth onto an existing passwordless row instead of duplicating', async () => {
      const existing = consultant({ passwordHash: null, azureId: null, role: null });
      const prisma = {
        consultant: {
          findUnique: jest.fn().mockResolvedValue(existing),
          update: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ ...existing, ...data, role: consultantRoleRow }),
          ),
        },
        role: { findUnique: jest.fn().mockResolvedValue(consultantRoleRow) },
      } as unknown as PrismaService;
      const service = new RbacService(prisma);

      const user = await service.registerWithPassword({
        email: 'a@b.com',
        password: 'hunter2hunter2',
        fullName: 'A B',
      });

      expect(user.consultantId).toBe('c1');
      expect(prisma.consultant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' } }),
      );
    });

    it('rejects when the email already has a password set', async () => {
      const existing = consultant({ passwordHash: 'already-set' });
      const prisma = { consultant: { findUnique: jest.fn().mockResolvedValue(existing) } } as unknown as PrismaService;
      const service = new RbacService(prisma);

      await expect(
        service.registerWithPassword({ email: 'a@b.com', password: 'x', fullName: 'A B' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
