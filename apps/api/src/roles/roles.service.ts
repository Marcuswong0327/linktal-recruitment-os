import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRolesDto } from './dto/query-roles.dto';

/** Include the role's granted permissions on every read. */
const withPermissions = { permissions: { include: { permission: true } } } as const;

type RoleWithPermissions = Prisma.RoleGetPayload<{ include: typeof withPermissions }>;

const ADMIN_ROLE = 'admin';
// Non-admins may not create/edit/delete these privileged roles.
const PROTECTED_ROLES = [ADMIN_ROLE, 'manager'];
// The superuser role is immutable for everyone (incl. admins) so it can never
// be renamed or stripped of permissions and lock the system out.
const IMMUTABLE_ROLES = [ADMIN_ROLE];
// The seeded roles can't be deleted (only custom roles can) — admins may still
// edit the non-admin ones.
const BUILTIN_ROLES = [ADMIN_ROLE, 'manager', 'consultant', 'finance', 'researcher', 'viewer'];

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryRolesDto) {
    const { page, pageSize, sortBy, sortOrder, q } = query;

    const where: Prisma.RoleWhereInput = {};
    if (q) {
      where.name = { contains: q, mode: Prisma.QueryMode.insensitive };
    }

    const orderBy: Prisma.RoleOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { name: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: withPermissions,
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toEntity(r)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: withPermissions });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return this.toEntity(role);
  }

  async create(dto: CreateRoleDto, actor: AuthUser) {
    const perms = dto.permissionIds ? await this.resolvePermissions(dto.permissionIds) : [];
    this.assertCanGrant(actor, perms);

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
      include: withPermissions,
    });
    return this.toEntity(role);
  }

  async update(id: string, dto: UpdateRoleDto, actor: AuthUser) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    this.assertRoleMutable(existing.name);
    this.assertCanMutateRole(actor, existing.name);

    // If the permission set is being replaced, validate + enforce the grant rule.
    const perms = dto.permissionIds ? await this.resolvePermissions(dto.permissionIds) : undefined;
    if (perms) {
      this.assertCanGrant(actor, perms);
    }

    const scalar: Prisma.RoleUpdateInput = { name: dto.name, description: dto.description };

    if (perms) {
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        this.prisma.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
        }),
        this.prisma.role.update({ where: { id }, data: scalar }),
      ]);
    } else {
      await this.prisma.role.update({ where: { id }, data: scalar });
    }

    return this.findOne(id);
  }

  async remove(id: string, actor: AuthUser) {
    const existing = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { consultants: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    this.assertRoleMutable(existing.name);
    this.assertCanMutateRole(actor, existing.name);
    this.assertRoleDeletable(existing.name);

    // Refuse to orphan users: reassign them off the role first.
    if (existing._count.consultants > 0) {
      throw new ConflictException(
        `Role "${existing.name}" still has ${existing._count.consultants} consultant(s). Reassign them before deleting.`,
      );
    }

    // RolePermission rows cascade on role delete.
    return this.prisma.role.delete({ where: { id } });
  }

  private isAdmin(actor: AuthUser): boolean {
    return actor.roleName === ADMIN_ROLE;
  }

  /** The admin role can't be edited or deleted by anyone. */
  private assertRoleMutable(roleName: string): void {
    if (IMMUTABLE_ROLES.includes(roleName)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `The "${roleName}" role is immutable and cannot be changed or deleted.`,
      });
    }
  }

  /** Built-in (seeded) roles can't be deleted — only custom roles can. */
  private assertRoleDeletable(roleName: string): void {
    if (BUILTIN_ROLES.includes(roleName)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `The built-in "${roleName}" role cannot be deleted.`,
      });
    }
  }

  /** Non-admins can't create/edit/delete the admin or manager roles. */
  private assertCanMutateRole(actor: AuthUser, roleName: string): void {
    if (!this.isAdmin(actor) && PROTECTED_ROLES.includes(roleName)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Only an admin can manage the "${roleName}" role.`,
      });
    }
  }

  /**
   * Escalation guard: a non-admin may only grant permissions they themselves
   * hold, so a manager can't mint a role more powerful than they are.
   */
  private assertCanGrant(
    actor: AuthUser,
    perms: { resource: string; action: string }[],
  ): void {
    if (this.isAdmin(actor)) return;
    const missing = perms.filter((p) => !actor.permissions.has(`${p.resource}:${p.action}`));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `You can only grant permissions you hold. Not allowed: ${missing
          .map((p) => `${p.resource}:${p.action}`)
          .join(', ')}`,
      });
    }
  }

  /** Loads the requested permissions, rejecting any unknown IDs. */
  private async resolvePermissions(ids: string[]) {
    const unique = [...new Set(ids)];
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: unique } },
      select: { id: true, resource: true, action: true },
    });
    if (perms.length !== unique.length) {
      const found = new Set(perms.map((p) => p.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new BadRequestException(`Unknown permission id(s): ${missing.join(', ')}`);
    }
    return perms;
  }

  /** Flatten RolePermission[] into a plain permission list for the response. */
  private toEntity(role: RoleWithPermissions) {
    const { permissions, ...rest } = role;
    return {
      ...rest,
      permissions: permissions.map((rp) => ({
        id: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
      })),
    };
  }
}
