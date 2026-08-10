import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  industryIds: [],
  specializationIds: [],
  locationIds: [],
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
    industry: { findMany: jest.fn().mockResolvedValue([]) },
    specialization: { findMany: jest.fn().mockResolvedValue([]) },
    // findMany validates the ids passed to setLocations; count is what the
    // post-grant-change coverage re-check calls (see clearUncoveredConsultantAssignments).
    location: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    consultantIndustry: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    consultantSpecialization: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    consultantLocation: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    // Narrowing a grant re-checks every record this consultant owns one at a
    // time (industry OR location can't be expressed as a single updateMany),
    // so these are findMany + update rather than a bulk write. Empty by
    // default: nothing is owned, so nothing is ever released.
    client: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    candidate: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    jobOrder: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
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

    it('clears pendingApproval when an admin sets isActive, regardless of direction', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({
        id: 'co1',
        isActive: false,
        role: { name: 'viewer' },
      });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      // Approve (false -> true) ...
      await service.update('co1', { isActive: true }, actor('admin'));
      expect(prisma.consultant.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: true, pendingApproval: false }) }),
      );

      // ... then flip back to inactive (a deliberate reversal, not the
      // original pending state) — must clear pendingApproval again, not
      // leave the row reading "Pending approval" a second time.
      await service.update('co1', { isActive: false }, actor('admin'));
      expect(prisma.consultant.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: false, pendingApproval: false }) }),
      );
    });

    it('does not touch pendingApproval when isActive is left unchanged', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue({ id: 'co1', role: { name: 'viewer' } });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.update('co1', { fullName: 'New Name' }, actor('admin'));
      expect(prisma.consultant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ pendingApproval: expect.anything() }) }),
      );
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
        industries: [],
        specializations: [],
        locations: [],
      });
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.update('actor', { isActive: false }, actor('admin')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.consultant.update).not.toHaveBeenCalled();
    });
  });

  describe('setIndustries', () => {
    function makeTarget(roleName: string, overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'co1',
        role: { name: roleName },
        industries: [],
        specializations: [],
        locations: [],
        isActive: true,
        email: 'target@linktal.com',
        fullName: 'Target',
        ...overrides,
      };
    }

    it('lets an admin assign industries to their own account', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('admin', { id: 'actor' }));
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind1', isActive: true }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setIndustries('actor', ['ind1'], actor('admin'));
      expect(prisma.consultantIndustry.create).toHaveBeenCalledWith({
        data: { consultantId: 'actor', industryId: 'ind1' },
      });
    });

    it('lets an admin assign industries to anyone else', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('consultant'));
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind1', isActive: true }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setIndustries('co1', ['ind1'], actor('admin'));
      expect(prisma.consultantIndustry.create).toHaveBeenCalledWith({
        data: { consultantId: 'co1', industryId: 'ind1' },
      });
    });

    it('blocks a manager from assigning industries to an admin account', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('admin'));
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setIndustries('co1', ['ind1'], actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.consultantIndustry.create).not.toHaveBeenCalled();
    });

    it('lets a manager assign industries to themselves', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('manager', { id: 'actor' }));
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind1', isActive: true }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setIndustries('actor', ['ind1'], actor('manager'));
      expect(prisma.consultantIndustry.create).toHaveBeenCalledWith({
        data: { consultantId: 'actor', industryId: 'ind1' },
      });
    });

    it('lets a manager assign industries to another manager', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('manager'));
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind1', isActive: true }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setIndustries('co1', ['ind1'], actor('manager'));
      expect(prisma.consultantIndustry.create).toHaveBeenCalledWith({
        data: { consultantId: 'co1', industryId: 'ind1' },
      });
    });

    it('lets a manager assign industries to a plain consultant', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('consultant'));
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind1', isActive: true }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setIndustries('co1', ['ind1'], actor('manager'));
      expect(prisma.consultantIndustry.create).toHaveBeenCalledWith({
        data: { consultantId: 'co1', industryId: 'ind1' },
      });
    });

    it('rejects an unknown industry id', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('consultant'));
      prisma.industry.findMany.mockResolvedValue([]); // 'bogus' not found
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setIndustries('co1', ['bogus'], actor('admin')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.consultantIndustry.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive industry id', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('consultant'));
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind1', isActive: false }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setIndustries('co1', ['ind1'], actor('admin')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.consultantIndustry.create).not.toHaveBeenCalled();
    });

    it('diffs the current set against the requested set — only adds/removes what changed', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('consultant'));
      prisma.industry.findMany.mockResolvedValue([
        { id: 'ind2', isActive: true },
        { id: 'ind3', isActive: true },
      ]);
      // Currently assigned: ind1, ind2. Requested: ind2, ind3 — ind1 removed, ind3 added, ind2 untouched.
      prisma.consultantIndustry.findMany.mockResolvedValue([
        { industryId: 'ind1' },
        { industryId: 'ind2' },
      ]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setIndustries('co1', ['ind2', 'ind3'], actor('admin'));

      expect(prisma.consultantIndustry.delete).toHaveBeenCalledTimes(1);
      expect(prisma.consultantIndustry.delete).toHaveBeenCalledWith({
        where: { consultantId_industryId: { consultantId: 'co1', industryId: 'ind1' } },
      });
      expect(prisma.consultantIndustry.create).toHaveBeenCalledTimes(1);
      expect(prisma.consultantIndustry.create).toHaveBeenCalledWith({
        data: { consultantId: 'co1', industryId: 'ind3' },
      });
      // A removal happened — every record this consultant owns gets re-checked
      // against their surviving grants (industry OR location), one at a time.
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { consultantId: 'co1' } }),
      );
    });

    it('does not touch the auto-clear cascade when nothing was removed', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('consultant'));
      prisma.industry.findMany.mockResolvedValue([{ id: 'ind1', isActive: true }]);
      prisma.consultantIndustry.findMany.mockResolvedValue([{ industryId: 'ind1' }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setIndustries('co1', ['ind1'], actor('admin'));
      expect(prisma.consultantIndustry.create).not.toHaveBeenCalled();
      expect(prisma.consultantIndustry.delete).not.toHaveBeenCalled();
      expect(prisma.client.findMany).not.toHaveBeenCalled();
    });
  });
  // The other two arms of the scope. They share setIndustries' escalation
  // rules and full-set-replace shape (assertCanAssignScope / applyScopeDiff),
  // so these cover what actually differs per arm rather than re-testing the
  // guard three times.
  describe('setSpecializations', () => {
    function makeTarget(roleName = 'consultant', overrides: Record<string, unknown> = {}) {
      return { id: 'co1', role: { name: roleName }, industries: [], ...overrides };
    }

    it('replaces the whole set, removing before adding', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.consultantIndustry.findMany.mockResolvedValue([{ industryId: 'ind1' }]);
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec2', isActive: true, industryId: 'ind1' },
        { id: 'spec3', isActive: true, industryId: 'ind1' },
      ]);
      prisma.consultantSpecialization.findMany.mockResolvedValue([
        { specializationId: 'spec1' },
        { specializationId: 'spec2' },
      ]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setSpecializations('co1', ['spec2', 'spec3'], actor('admin'));

      // spec1 dropped, spec3 added, spec2 left alone rather than churned
      expect(prisma.consultantSpecialization.delete).toHaveBeenCalledTimes(1);
      expect(prisma.consultantSpecialization.delete).toHaveBeenCalledWith({
        where: { consultantId_specializationId: { consultantId: 'co1', specializationId: 'spec1' } },
      });
      expect(prisma.consultantSpecialization.create).toHaveBeenCalledTimes(1);
      expect(prisma.consultantSpecialization.create).toHaveBeenCalledWith({
        data: { consultantId: 'co1', specializationId: 'spec3' },
      });
    });

    it('rejects unknown specialization ids', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.consultantIndustry.findMany.mockResolvedValue([{ industryId: 'ind1' }]);
      prisma.specialization.findMany.mockResolvedValue([]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setSpecializations('co1', ['bogus'], actor('admin')),
      ).rejects.toMatchObject({ response: { code: 'INVALID_SPECIALIZATION' } });
      expect(prisma.consultantSpecialization.create).not.toHaveBeenCalled();
    });

    it('rejects retired specializations', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.consultantIndustry.findMany.mockResolvedValue([{ industryId: 'ind1' }]);
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec1', isActive: false, industryId: 'ind1' },
      ]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setSpecializations('co1', ['spec1'], actor('admin')),
      ).rejects.toMatchObject({ response: { code: 'INACTIVE_SPECIALIZATION' } });
    });

    it('rejects specializations when the consultant holds no industries', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      // consultantIndustry.findMany defaults to [] in makePrisma().
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setSpecializations('co1', ['spec1'], actor('admin')),
      ).rejects.toMatchObject({ response: { code: 'NO_INDUSTRIES_ASSIGNED' } });
      expect(prisma.specialization.findMany).not.toHaveBeenCalled();
      expect(prisma.consultantSpecialization.create).not.toHaveBeenCalled();
    });

    it('rejects a specialization whose industry the consultant does not hold', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.consultantIndustry.findMany.mockResolvedValue([{ industryId: 'ind1' }]);
      prisma.specialization.findMany.mockResolvedValue([
        { id: 'spec1', isActive: true, industryId: 'ind2' },
      ]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setSpecializations('co1', ['spec1'], actor('admin')),
      ).rejects.toMatchObject({ response: { code: 'SPECIALIZATION_INDUSTRY_MISMATCH' } });
      expect(prisma.consultantSpecialization.create).not.toHaveBeenCalled();
    });

    it('applies the same escalation rules as industries', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget('admin'));
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setSpecializations('co1', ['spec1'], actor('manager')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // Specializations only ever narrow the industry arm — they never grant on
    // their own — so narrowing them can't strand anyone's assigned records.
    // Industries and locations both do, and both re-check (see setLocations).
    it('does not cascade to assigned records when grants are removed', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.consultantSpecialization.findMany.mockResolvedValue([{ specializationId: 'spec1' }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setSpecializations('co1', [], actor('admin'));

      expect(prisma.consultantSpecialization.delete).toHaveBeenCalledTimes(1);
      expect(prisma.client.findMany).not.toHaveBeenCalled();
      expect(prisma.candidate.findMany).not.toHaveBeenCalled();
    });
  });

  describe('setLocations', () => {
    function makeTarget(roleName = 'consultant', overrides: Record<string, unknown> = {}) {
      return { id: 'co1', role: { name: roleName }, industries: [], ...overrides };
    }

    // Grants are materialised concrete nodes at mixed levels — "All Malaysia"
    // is one COUNTRY id, "Brisbane GC QLD" two CITY ids — and each is written
    // as its own audited row.
    it('writes one grant row per node, at whatever level it sits', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.location.findMany.mockResolvedValue([{ id: 'brisbane' }, { id: 'goldcoast' }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setLocations('co1', ['brisbane', 'goldcoast'], actor('admin'));

      expect(prisma.consultantLocation.create).toHaveBeenCalledTimes(2);
      expect(prisma.consultantLocation.create).toHaveBeenCalledWith({
        data: { consultantId: 'co1', locationId: 'brisbane' },
      });
    });

    it('rejects unknown location ids', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.location.findMany.mockResolvedValue([]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await expect(
        service.setLocations('co1', ['nowhere'], actor('admin')),
      ).rejects.toMatchObject({ response: { code: 'INVALID_LOCATION' } });
      expect(prisma.consultantLocation.create).not.toHaveBeenCalled();
    });

    // Location is a bulk-loaded GeoNames tree with no isActive column, so
    // existence is the only check — the rows come back without the field.
    it('accepts location rows that carry no isActive column', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.location.findMany.mockResolvedValue([{ id: 'nsw' }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setLocations('co1', ['nsw'], actor('admin'));
      expect(prisma.consultantLocation.create).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates a repeated id instead of writing it twice', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.location.findMany.mockResolvedValue([{ id: 'nsw' }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setLocations('co1', ['nsw', 'nsw'], actor('admin'));
      expect(prisma.consultantLocation.create).toHaveBeenCalledTimes(1);
    });

    it('clears every grant when given an empty list', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.consultantLocation.findMany.mockResolvedValue([{ locationId: 'nsw' }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setLocations('co1', [], actor('admin'));

      expect(prisma.consultantLocation.delete).toHaveBeenCalledWith({
        where: { consultantId_locationId: { consultantId: 'co1', locationId: 'nsw' } },
      });
      expect(prisma.location.findMany).not.toHaveBeenCalled();
    });

    // Locations grant ownership now, so narrowing a patch strands records the
    // same way dropping an industry does, and has to cascade the same way.
    it('re-checks assigned records when a location grant is removed', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.consultantLocation.findMany.mockResolvedValue([{ locationId: 'nsw' }]);
      prisma.client.findMany.mockResolvedValue([
        { id: 'cl1', industryId: 'ind1', locations: [{ locationId: 'syd' }] },
      ]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setLocations('co1', [], actor('admin'));

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { consultantId: 'co1' } }),
      );
      // No grants left at all, so the record is released.
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'cl1' },
        data: { consultantId: null },
      });
    });

    it('does not re-check when nothing was removed', async () => {
      const prisma = makePrisma();
      prisma.consultant.findUnique.mockResolvedValue(makeTarget());
      prisma.location.findMany.mockResolvedValue([{ id: 'nsw' }]);
      prisma.consultantLocation.findMany.mockResolvedValue([{ locationId: 'nsw' }]);
      const service = new ConsultantsService(prisma as unknown as ExtendedPrismaClient);

      await service.setLocations('co1', ['nsw'], actor('admin'));
      expect(prisma.client.findMany).not.toHaveBeenCalled();
    });
  });
});

// The org chart. Presentation only — `docs/rbac-roles.md` §3 is explicit that
// reporting lines are not a permission boundary, so these tests pin the shape
// of the query rather than any access behaviour.
describe('ConsultantsService.hierarchy', () => {
  function setup(rows: unknown[] = []) {
    const queryRaw = jest.fn().mockResolvedValue(rows);
    const findUnique = jest.fn().mockResolvedValue({ id: 'c1' });
    const prisma = {
      $queryRaw: queryRaw,
      consultant: { findUnique },
    } as unknown as ExtendedPrismaClient;
    return { service: new ConsultantsService(prisma), queryRaw, findUnique };
  }

  it('roots the whole chart at everyone with no manager', async () => {
    const { service, queryRaw, findUnique } = setup();
    await service.hierarchy(undefined);

    expect(findUnique).not.toHaveBeenCalled(); // nothing to validate
    const sql = queryRaw.mock.calls[0][0].strings.join('');
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('IS NULL');
  });

  it('roots a "my team" query at the requested consultant', async () => {
    const { service, queryRaw, findUnique } = setup();
    await service.hierarchy('c1');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'c1' }, select: { id: true } });
    // The id is parameterised, not interpolated into the SQL text.
    expect(queryRaw.mock.calls[0][0].values).toContain('c1');
  });

  it('404s on an unknown root rather than returning an empty tree', async () => {
    const { service, queryRaw } = setup();
    (service as unknown as { prisma: { consultant: { findUnique: jest.Mock } } }).prisma.consultant.findUnique.mockResolvedValue(
      null,
    );
    await expect(service.hierarchy('nope')).rejects.toThrow(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  // reportsToId is a self-referencing FK with nothing stopping A -> B -> A;
  // without the guard the CTE would spin until the connection died.
  it('guards against a reporting cycle', async () => {
    const { service, queryRaw } = setup();
    await service.hierarchy(undefined);
    const sql = queryRaw.mock.calls[0][0].strings.join('');
    expect(sql).toContain('ARRAY[c.id]');
    expect(sql).toContain('NOT c.id = ANY(tree.path)');
  });

  it('returns the rows depth-ordered, without the internal path column', async () => {
    const rows = [
      { id: 'c1', displayId: 'consultant-0001', fullName: 'Chen Yu', reportsToId: null, roleName: 'manager', isActive: true, depth: 0 },
      { id: 'c2', displayId: 'consultant-0002', fullName: 'Daniel Kee', reportsToId: 'c1', roleName: 'consultant', isActive: true, depth: 1 },
    ];
    const { service, queryRaw } = setup(rows);
    const result = await service.hierarchy(undefined);

    expect(result).toEqual(rows);
    expect(result[0]).not.toHaveProperty('path');
    expect(queryRaw.mock.calls[0][0].strings.join('')).toContain('ORDER BY tree.depth');
  });
});
