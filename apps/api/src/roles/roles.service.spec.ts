import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  industryIds: [],
  specializationIds: [],
  locationIds: [],
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
    consultant: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn(), findUnique: jest.fn() },
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

  // Gap 2: no dedicated versioning table — every CREATE/UPDATE already wrote
  // a full name/description/permissionIds snapshot to AuditLog (see above),
  // so `history` just reshapes that trail and `restore` replays one entry
  // back through `update()`.
  describe('history', () => {
    it('404s when the role does not exist', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue(null);
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(service.history('missing', 10)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns saved versions newest first, with actor names resolved, capped at the given limit', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log2',
          action: 'UPDATE',
          actorId: 'actor',
          changes: { name: 'finance', description: 'Updated', permissionIds: ['p1', 'p2'] },
          createdAt: new Date('2026-01-02'),
        },
        {
          id: 'log1',
          action: 'CREATE',
          actorId: 'actor',
          changes: { name: 'finance', permissionIds: ['p1'] },
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.consultant.findMany.mockResolvedValue([{ id: 'actor', fullName: 'Actor' }]);
      const service = new RolesService(prisma as unknown as PrismaService);

      const result = await service.history('r1', 2);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Role', entityId: 'r1', action: { in: ['CREATE', 'UPDATE'] } },
          orderBy: { createdAt: 'desc' },
          take: 2,
        }),
      );
      expect(result).toEqual([
        {
          id: 'log2',
          action: 'UPDATE',
          actorId: 'actor',
          actorName: 'Actor',
          name: 'finance',
          description: 'Updated',
          permissionIds: ['p1', 'p2'],
          createdAt: new Date('2026-01-02'),
        },
        {
          id: 'log1',
          action: 'CREATE',
          actorId: 'actor',
          actorName: 'Actor',
          name: 'finance',
          description: null,
          permissionIds: ['p1'],
          createdAt: new Date('2026-01-01'),
        },
      ]);
    });

    it("nulls out permissionIds (and actorName) for a save that didn't touch them, rather than guessing", async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log1',
          action: 'UPDATE',
          actorId: null,
          changes: { name: 'finance', description: 'renamed only' },
          createdAt: new Date('2026-01-01'),
        },
      ]);
      const service = new RolesService(prisma as unknown as PrismaService);

      const [entry] = await service.history('r1', 10);

      expect(entry).toMatchObject({ permissionIds: null, actorId: null, actorName: null });
      expect(prisma.consultant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('404s when the version does not exist', async () => {
      const prisma = makePrisma();
      prisma.auditLog.findUnique.mockResolvedValue(null);
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.restore('r1', { auditLogId: 'missing' }, actor('admin')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the version belongs to a different role', async () => {
      const prisma = makePrisma();
      prisma.auditLog.findUnique.mockResolvedValue({
        id: 'log1',
        entityType: 'Role',
        entityId: 'other-role',
        changes: { name: 'finance', permissionIds: ['p1'] },
      });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.restore('r1', { auditLogId: 'log1' }, actor('admin')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects restoring a version that didn't capture a permission set", async () => {
      const prisma = makePrisma();
      prisma.auditLog.findUnique.mockResolvedValue({
        id: 'log1',
        entityType: 'Role',
        entityId: 'r1',
        changes: { name: 'finance', description: 'renamed only' },
      });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.restore('r1', { auditLogId: 'log1' }, actor('admin')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replays the snapshot through update(), writing a fresh audited UPDATE', async () => {
      const prisma = makePrisma();
      prisma.auditLog.findUnique.mockResolvedValue({
        id: 'log1',
        entityType: 'Role',
        entityId: 'r1',
        changes: { name: 'finance', description: 'Old description', permissionIds: ['p1'] },
      });
      prisma.role.findUnique.mockResolvedValue({
        id: 'r1',
        name: 'finance',
        description: 'Current description',
        permissions: [],
        _count: { consultants: 0 },
      });
      prisma.permission.findMany.mockResolvedValue([{ id: 'p1', resource: 'candidate', action: 'read' }]);
      const service = new RolesService(prisma as unknown as PrismaService);

      await service.restore('r1', { auditLogId: 'log1' }, actor('admin'));

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'r1', permissionId: 'p1' }],
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'UPDATE', entityType: 'Role', entityId: 'r1' }),
        }),
      );
    });

    it("inherits update()'s guards — still blocks restoring onto the immutable admin role", async () => {
      const prisma = makePrisma();
      prisma.auditLog.findUnique.mockResolvedValue({
        id: 'log1',
        entityType: 'Role',
        entityId: 'r-admin',
        changes: { name: 'admin', permissionIds: ['p1'] },
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'admin' });
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.restore('r-admin', { auditLogId: 'log1' }, actor('admin')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.role.update).not.toHaveBeenCalled();
    });

    it("inherits update()'s escalation guard — a manager can't restore permissions it doesn't itself hold", async () => {
      const prisma = makePrisma();
      prisma.auditLog.findUnique.mockResolvedValue({
        id: 'log1',
        entityType: 'Role',
        entityId: 'r1',
        changes: { name: 'finance', permissionIds: ['p9'] },
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'finance' });
      prisma.permission.findMany.mockResolvedValue([{ id: 'p9', resource: 'user', action: 'delete' }]);
      const service = new RolesService(prisma as unknown as PrismaService);

      await expect(
        service.restore('r1', { auditLogId: 'log1' }, actor('manager', ['candidate:read'])),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
