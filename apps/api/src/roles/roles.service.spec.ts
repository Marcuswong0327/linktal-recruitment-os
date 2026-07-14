import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

const actor = (roleName: string | null, permissions: string[] = []): AuthUser => ({
  consultantId: 'actor',
  azureId: 'azure',
  email: 'actor@linktal.com',
  fullName: 'Actor',
  roleName,
  isActive: true,
  permissions: new Set(permissions),
});

function makePrisma() {
  return {
    role: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'r1', name: 'finance', permissions: [], _count: { consultants: 0 } }),
      update: jest.fn().mockResolvedValue({ id: 'r1' }),
      delete: jest.fn().mockResolvedValue({ id: 'r1' }),
      findUnique: jest.fn(),
    },
    permission: { findMany: jest.fn() },
    rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
    consultant: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
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

    it('reassigns holders to a fallback role, then deletes', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique
        .mockResolvedValueOnce({ id: 'r1', name: 'contractor', _count: { consultants: 3 } })
        .mockResolvedValueOnce({ name: 'viewer' }); // reassign-target lookup
      prisma.consultant.updateMany.mockResolvedValue({ count: 3 });
      const service = new RolesService(prisma as unknown as PrismaService);

      await service.remove('r1', actor('admin'), 'r-viewer');

      expect(prisma.consultant.updateMany).toHaveBeenCalledWith({
        where: { roleId: 'r1' },
        data: { roleId: 'r-viewer' },
      });
      expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'HARD_DELETE',
        entityType: 'Role',
        changes: { reassignedTo: 'viewer', reassignedCount: 3 },
      });
    });

    it('rejects reassigning holders to the role being deleted', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({
        id: 'r1',
        name: 'contractor',
        _count: { consultants: 2 },
      });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(service.remove('r1', actor('admin'), 'r1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });
  });

  // Gap 1: RolesService runs on the base client (batch transactions), so it
  // audits its mutations explicitly rather than via the Prisma extension.
  describe('audit trail', () => {
    it('logs a CREATE when a role is created', async () => {
      const prisma = makePrisma();
      const service = new RolesService(prisma as unknown as PrismaService);

      await service.create({ name: 'junior' }, actor('admin'));

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        actorId: 'actor',
        action: 'CREATE',
        entityType: 'Role',
      });
    });

    it('logs an UPDATE when a role is edited', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({
        id: 'r1',
        name: 'finance',
        permissions: [],
        _count: { consultants: 0 },
      });
      const service = new RolesService(prisma as unknown as PrismaService);

      await service.update('r1', { description: 'Updated' }, actor('admin'));

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'UPDATE', entityType: 'Role', entityId: 'r1' }),
        }),
      );
    });

    it('logs a HARD_DELETE when a custom role is deleted', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({
        id: 'r1',
        name: 'contractor',
        _count: { consultants: 0 },
      });
      const service = new RolesService(prisma as unknown as PrismaService);

      await service.remove('r1', actor('admin'));

      expect(prisma.role.delete).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'HARD_DELETE', entityType: 'Role', entityId: 'r1' }),
        }),
      );
    });
  });
});
