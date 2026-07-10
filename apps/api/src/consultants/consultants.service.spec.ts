import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConsultantsService } from './consultants.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

const actor = (roleName: string | null): AuthUser => ({
  consultantId: 'actor',
  neonUserId: 'neon',
  email: 'actor@linktal.com',
  fullName: 'Actor',
  roleName,
  isActive: true,
  permissions: new Set<string>(),
});

function makePrisma() {
  return {
    consultant: {
      create: jest.fn().mockResolvedValue({ id: 'co1', displayId: 'consultant-0017' }),
      update: jest.fn().mockResolvedValue({ id: 'co1' }),
      delete: jest.fn().mockResolvedValue({ id: 'co1' }),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    role: { findUnique: jest.fn() },
  };
}

describe('ConsultantsService', () => {
  describe('create', () => {
    it('creates without setting displayId (DB sequence owns it)', async () => {
      const prisma = makePrisma();
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      const result = await service.create(
        { email: 'jane@linktal.com', fullName: 'Jane Doe' },
        actor('admin'),
      );

      expect(prisma.consultant.create).toHaveBeenCalledTimes(1);
      expect(prisma.consultant.create.mock.calls[0][0].data).not.toHaveProperty('displayId');
      expect(result).toEqual({ id: 'co1', displayId: 'consultant-0017' });
    });

    it('blocks a manager from creating an admin', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({ name: 'admin' });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(
        service.create(
          { email: 'x@linktal.com', fullName: 'X', roleId: 'role-admin' },
          actor('manager'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.create).not.toHaveBeenCalled();
    });

    it('blocks a manager from creating a manager', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({ name: 'manager' });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(
        service.create(
          { email: 'x@linktal.com', fullName: 'X', roleId: 'role-manager' },
          actor('manager'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.create).not.toHaveBeenCalled();
    });

    it('lets an admin create an admin', async () => {
      const prisma = makePrisma();
      prisma.role.findUnique.mockResolvedValue({ name: 'admin' });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await service.create(
        { email: 'x@linktal.com', fullName: 'X', roleId: 'role-admin' },
        actor('admin'),
      );
      expect(prisma.consultant.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('blocks a manager from modifying an admin consultant', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'admin' } });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(
        service.update('co1', { fullName: 'New' }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks a manager from promoting a consultant to admin', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      prisma.role.findUnique.mockResolvedValue({ name: 'admin' });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(
        service.update('co1', { roleId: 'role-admin' }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks a manager from promoting a consultant to manager', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      prisma.role.findUnique.mockResolvedValue({ name: 'manager' });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(
        service.update('co1', { roleId: 'role-manager' }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('lets a manager update a non-admin consultant', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await service.update('co1', { fullName: 'New Name' }, actor('manager'));
      expect(prisma.consultant.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('blocks a manager from deleting an admin consultant', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'admin' } });
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(service.remove('co1', actor('manager'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.consultant.delete).not.toHaveBeenCalled();
    });

    it('lets an admin delete an admin consultant when another active admin exists', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'admin' },
      });
      prisma.consultant.count.mockResolvedValue(1); // one other active admin
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await service.remove('co1', actor('admin'));
      expect(prisma.consultant.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('last-admin protection', () => {
    it('blocks demoting the last active admin', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'admin' },
      });
      prisma.role.findUnique.mockResolvedValue({ name: 'viewer' }); // demote target
      prisma.consultant.count.mockResolvedValue(0); // no other active admins
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(
        service.update('co1', { roleId: 'role-viewer' }, actor('admin')),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks deactivating the last active admin', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'admin' },
      });
      prisma.consultant.count.mockResolvedValue(0);
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(
        service.update('co1', { isActive: false }, actor('admin')),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks deleting the last active admin', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'admin' },
      });
      prisma.consultant.count.mockResolvedValue(0);
      const service = new ConsultantsService(prisma as unknown as PrismaService);

      await expect(service.remove('co1', actor('admin'))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.consultant.delete).not.toHaveBeenCalled();
    });
  });
});
