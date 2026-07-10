import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

const actor = (roleName: string | null, permissions: string[] = []): AuthUser => ({
  consultantId: 'actor',
  neonUserId: 'neon',
  email: 'actor@linktal.com',
  fullName: 'Actor',
  roleName,
  isActive: true,
  permissions: new Set(permissions),
});

function makePrisma() {
  return {
    role: {
      create: jest.fn().mockResolvedValue({ id: 'r1', name: 'finance', permissions: [] }),
      update: jest.fn().mockResolvedValue({ id: 'r1' }),
      delete: jest.fn().mockResolvedValue({ id: 'r1' }),
      findUnique: jest.fn(),
    },
    permission: { findMany: jest.fn() },
    rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

describe('RolesService', () => {
  describe('create', () => {
    it('lets a manager grant only permissions it holds', async () => {
      const prisma = makePrisma();
      prisma.permission.findMany.mockResolvedValue([
        { id: 'p1', resource: 'candidate', action: 'read' },
      ]);
      const service = new RolesService(prisma as unknown as PrismaService);

      await service.create(
        { name: 'junior', permissionIds: ['p1'] },
        actor('manager', ['candidate:read']),
      );
      expect(prisma.role.create).toHaveBeenCalledTimes(1);
    });

    it('blocks a manager from granting a permission it lacks (escalation)', async () => {
      const prisma = makePrisma();
      prisma.permission.findMany.mockResolvedValue([
        { id: 'p9', resource: 'user', action: 'delete' },
      ]);
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.create({ name: 'super', permissionIds: ['p9'] }, actor('manager', ['candidate:read'])),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.role.create).not.toHaveBeenCalled();
    });

    it('lets an admin grant any permission', async () => {
      const prisma = makePrisma();
      prisma.permission.findMany.mockResolvedValue([
        { id: 'p9', resource: 'user', action: 'delete' },
      ]);
      const service = new RolesService(prisma as unknown as PrismaService);

      await service.create({ name: 'super', permissionIds: ['p9'] }, actor('admin'));
      expect(prisma.role.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('blocks a manager from editing the admin role', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'admin' });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.update('r-admin', { description: 'x' }, actor('manager', [])),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks even an admin from editing the immutable admin role', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'admin' });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.update('r-admin', { description: 'x' }, actor('admin')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.role.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('blocks deleting a built-in role even for an admin', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({
        id: 'r-consultant',
        name: 'consultant',
        _count: { consultants: 0 },
      });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(service.remove('r-consultant', actor('admin'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a (custom) role that still has consultants', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({
        id: 'r1',
        name: 'contractor', // custom role, not built-in
        _count: { consultants: 2 },
      });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(service.remove('r1', actor('admin'))).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });
  });
});
