import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConsultantsService } from './consultants.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';

const actor = (roleName: string | null): AuthUser => ({
  consultantId: 'actor',
  azureId: 'azure',
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
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

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
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

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
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

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
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

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
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('co1', { fullName: 'New' }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks a manager from promoting a consultant to admin', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      prisma.role.findUnique.mockResolvedValue({ name: 'admin' });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('co1', { roleId: 'role-admin' }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks a manager from promoting a consultant to manager', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      prisma.role.findUnique.mockResolvedValue({ name: 'manager' });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('co1', { roleId: 'role-manager' }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks a manager from updating a consultant (management is admin-only)', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('co1', { fullName: 'New Name' }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('lets an admin update a non-admin consultant', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.update('co1', { fullName: 'New Name' }, actor('admin'));
      expect(prisma.consultant.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('blocks a manager from deactivating an admin consultant', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'admin' } });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(service.remove('co1', actor('manager'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks a manager from deactivating even a non-admin consultant (admin-only IAM)', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'viewer' },
      });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(service.remove('co1', actor('manager'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('lets an admin deactivate an admin consultant when another active admin exists', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'admin' },
      });
      prisma.consultant.count.mockResolvedValue(1); // one other active admin
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.remove('co1', actor('admin'));
      expect(prisma.consultant.update).toHaveBeenCalledTimes(1);
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
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

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
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('co1', { isActive: false }, actor('admin')),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('blocks deactivating the last active admin (via remove)', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'admin' },
      });
      prisma.consultant.count.mockResolvedValue(0);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(service.remove('co1', actor('admin'))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });
  });

  describe('IAM guards (role / active status are admin-only)', () => {
    it('blocks a manager from changing active status', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'viewer' },
      });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('co1', { isActive: false }, actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });

    it('resolves roleName → roleId when an admin assigns by name', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: true,
        role: { name: 'viewer' },
      });
      prisma.role.findUnique.mockResolvedValue({ id: 'role-finance' });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.update('co1', { roleName: 'finance' as never }, actor('admin'));
      expect(prisma.consultant.update).toHaveBeenCalledTimes(1);
      expect(prisma.consultant.update.mock.calls[0][0].data).toMatchObject({ roleId: 'role-finance' });
    });

    it('blocks an admin from deactivating their own account (self-lockout)', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'actor',
        isActive: true,
        role: { name: 'admin' },
      });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('actor', { isActive: false }, actor('admin')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });
  });
});
