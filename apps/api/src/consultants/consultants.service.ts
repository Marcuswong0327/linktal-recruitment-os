import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';
import { CreateConsultantDto } from './dto/create-consultant.dto';
import { UpdateConsultantDto } from './dto/update-consultant.dto';
import { QueryConsultantsDto } from './dto/query-consultants.dto';

/** Every read embeds the resolved role so the directory can show it. */
const withRole = { role: { select: { id: true, name: true } } } as const;
// Never return the bcrypt hash — these queries feed API responses directly.
const omitSecrets = { passwordHash: true } as const;

const ADMIN_ROLE = 'admin';
// Assigning either of these privileged roles is admin-only.
const PRIVILEGED_ROLES = [ADMIN_ROLE, 'manager'];

@Injectable()
export class ConsultantsService {
  constructor(@Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  async findAll(query: QueryConsultantsDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.ConsultantWhereInput = {};

    if (query.roleId) {
      where.roleId = query.roleId;
    }

    if (query.roleName) {
      where.role = { name: { equals: query.roleName, mode: Prisma.QueryMode.insensitive } };
    }

    if (query.isActive != null) {
      where.isActive = query.isActive;
    }

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { displayId: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const orderBy: Prisma.ConsultantOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' };

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [data, total] = await Promise.all([
      this.prisma.consultant.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: withRole,
        omit: omitSecrets,
      }),
      this.prisma.consultant.count({ where }),
    ]);

    return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const consultant = await this.prisma.consultant.findUnique({
      where: { id },
      include: withRole,
      omit: omitSecrets,
    });
    if (!consultant) {
      throw new NotFoundException(`Consultant ${id} not found`);
    }
    return consultant;
  }

  async findByDisplayId(displayId: string) {
    const consultant = await this.prisma.consultant.findUnique({
      where: { displayId },
      include: withRole,
      omit: omitSecrets,
    });
    if (!consultant) {
      throw new NotFoundException(`Consultant ${displayId} not found`);
    }
    return consultant;
  }

  async create(dto: CreateConsultantDto, actor: AuthUser) {
    if (!this.isAdmin(actor) && (await this.roleIsPrivileged(dto.roleId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can assign the admin or manager role.',
      });
    }
    // displayId is assigned by the DB (Consultant_displayId_seq default).
    return this.prisma.consultant.create({ data: dto, include: withRole, omit: omitSecrets });
  }

  /**
   * Admin-only management of another consultant (role, active status, details).
   * Self-service name edits go through `updateOwnProfile` (`/consultants/me`),
   * not here. Guarded against self-lockout and removing the last active admin.
   */
  async update(id: string, dto: UpdateConsultantDto, actor: AuthUser) {
    const existing = await this.findOne(id);

    // Managing consultants (roles / status / details) is admin-only IAM.
    if (!this.isAdmin(actor)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can manage consultants.',
      });
    }

    // Resolve an optional role *name* (admin UI) to its id; roleId still works too.
    let roleId = dto.roleId;
    if (dto.roleName !== undefined) {
      const role = await this.prisma.role.findUnique({
        where: { name: dto.roleName },
        select: { id: true },
      });
      if (!role) {
        throw new BadRequestException({ code: 'INVALID_ROLE', message: `Unknown role "${dto.roleName}"` });
      }
      roleId = role.id;
    }

    const changesRole = dto.roleId !== undefined || dto.roleName !== undefined;

    // Self-lockout: you can't deactivate or de-admin your own account here.
    if (id === actor.consultantId) {
      if (dto.isActive === false) {
        throw new BadRequestException({
          code: 'CANNOT_MODIFY_SELF',
          message: 'You cannot deactivate your own account.',
        });
      }
      if (changesRole && !(await this.roleIsAdmin(roleId))) {
        throw new BadRequestException({
          code: 'CANNOT_MODIFY_SELF',
          message: 'You cannot change your own role away from admin.',
        });
      }
    }

    // Last-admin protection: block demoting/deactivating the final active admin.
    const demotesAdmin =
      existing.role?.name === ADMIN_ROLE &&
      existing.isActive &&
      ((changesRole && !(await this.roleIsAdmin(roleId))) || dto.isActive === false);
    if (demotesAdmin && (await this.countOtherActiveAdmins(id)) === 0) {
      throw new ConflictException('Cannot demote or deactivate the last active admin.');
    }

    // Build the write payload: drop roleName, apply the resolved roleId.
    const { roleName: _roleName, roleId: _roleId, ...rest } = dto;
    const data: Prisma.ConsultantUncheckedUpdateInput = { ...rest };
    if (changesRole) data.roleId = roleId ?? null;

    return this.prisma.consultant.update({ where: { id }, data, include: withRole, omit: omitSecrets });
  }

  /**
   * "Deleting" a consultant deactivates them (isActive=false) rather than
   * removing the row — consultants own clients/job orders whose ownership
   * history we must keep, and deactivation already blocks login on every
   * request (RbacService.assertActive). Audited as DEACTIVATE by the extension.
   * Deactivation is an IAM change, so it's admin-only like `update`.
   */
  async remove(id: string, actor: AuthUser) {
    const existing = await this.findOne(id);
    if (!this.isAdmin(actor)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can deactivate a consultant.',
      });
    }

    // Already inactive — nothing to do (avoids a misleading DEACTIVATE audit row).
    if (!existing.isActive) {
      return existing;
    }

    // Last-admin protection: block deactivating the final active admin.
    if (
      existing.role?.name === ADMIN_ROLE &&
      (await this.countOtherActiveAdmins(id)) === 0
    ) {
      throw new ConflictException('Cannot deactivate the last active admin.');
    }

    return this.prisma.consultant.update({
      where: { id },
      data: { isActive: false },
      include: withRole,
      omit: omitSecrets,
    });
  }

  /** Update the caller's own profile — name only; never role or active status. */
  async updateOwnProfile(id: string, fullName: string) {
    await this.findOne(id);
    return this.prisma.consultant.update({
      where: { id },
      data: { fullName },
      include: withRole,
      omit: omitSecrets,
    });
  }

  /** Active admins other than `excludeId`. Used for last-admin protection. */
  private countOtherActiveAdmins(excludeId: string): Promise<number> {
    return this.prisma.consultant.count({
      where: { id: { not: excludeId }, isActive: true, role: { name: ADMIN_ROLE } },
    });
  }

  private isAdmin(actor: AuthUser): boolean {
    return actor.roleName === ADMIN_ROLE;
  }

  /** True when `roleId` refers to a privileged (admin/manager) role. */
  private async roleIsPrivileged(roleId: string | null | undefined): Promise<boolean> {
    if (!roleId) return false;
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });
    return role != null && PRIVILEGED_ROLES.includes(role.name);
  }

  /** True when `roleId` refers to the admin role (used for last-admin checks). */
  private async roleIsAdmin(roleId: string | null | undefined): Promise<boolean> {
    if (!roleId) return false;
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });
    return role?.name === ADMIN_ROLE;
  }
}
