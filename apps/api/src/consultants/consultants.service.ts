import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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

    const [data, total] = await this.prisma.$transaction([
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

  async update(id: string, dto: UpdateConsultantDto, actor: AuthUser) {
    const existing = await this.findOne(id);
    if (!this.isAdmin(actor)) {
      if (existing.role?.name === ADMIN_ROLE) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only an admin can modify an admin consultant.',
        });
      }
      if (await this.roleIsPrivileged(dto.roleId)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only an admin can assign the admin or manager role.',
        });
      }
    }

    // Last-admin protection: block demoting or deactivating the final active admin.
    const demotesAdmin =
      existing.role?.name === ADMIN_ROLE &&
      existing.isActive &&
      ((dto.roleId !== undefined && !(await this.roleIsAdmin(dto.roleId))) ||
        dto.isActive === false);
    if (demotesAdmin && (await this.countOtherActiveAdmins(id)) === 0) {
      throw new ConflictException('Cannot demote or deactivate the last active admin.');
    }

    return this.prisma.consultant.update({ where: { id }, data: dto, include: withRole, omit: omitSecrets });
  }

  async remove(id: string, actor: AuthUser) {
    const existing = await this.findOne(id);
    if (!this.isAdmin(actor) && existing.role?.name === ADMIN_ROLE) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can delete an admin consultant.',
      });
    }

    // Last-admin protection: block deleting the final active admin.
    if (
      existing.role?.name === ADMIN_ROLE &&
      existing.isActive &&
      (await this.countOtherActiveAdmins(id)) === 0
    ) {
      throw new ConflictException('Cannot delete the last active admin.');
    }

    return this.prisma.consultant.delete({ where: { id }, omit: omitSecrets });
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
