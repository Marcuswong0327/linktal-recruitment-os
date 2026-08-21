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
import { RestoreRoleDto } from './dto/restore-role.dto';

/** Include the role's granted permissions + how many consultants hold it. */
const withPermissions = {
  permissions: { include: { permission: true } },
  _count: { select: { consultants: true } },
} as const;

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

    // Parallel, not $transaction: these two reads don't need one consistent
    // DB snapshot, and running them concurrently instead of sequentially
    // (BEGIN/Q1/Q2/COMMIT) roughly halves the network round trips to Neon.
    const [rows, total] = await Promise.all([
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
    // Audited explicitly (not via the Prisma extension): RolesService uses the
    // base client + batch transactions, which the audit hook can't safely wrap.
    await this.logRoleChange('CREATE', role.id, actor, {
      name: dto.name,
      permissionIds: dto.permissionIds ?? [],
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

    // Written after the transaction commits so it can't outlive a rollback.
    await this.logRoleChange('UPDATE', id, actor, {
      name: dto.name,
      description: dto.description,
      ...(perms ? { permissionIds: perms.map((p) => p.id) } : {}),
    });

    return this.findOne(id);
  }

  async remove(id: string, actor: AuthUser, reassignToId?: string) {
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

    // A role can't be deleted while consultants hold it. Move them to a chosen
    // fallback role first (their permissions become the fallback's), then delete.
    let reassign: { toName: string; count: number } | null = null;
    if (existing._count.consultants > 0) {
      if (!reassignToId) {
        throw new ConflictException(
          `Role "${existing.name}" still has ${existing._count.consultants} consultant(s). Choose a role to reassign them to.`,
        );
      }
      if (reassignToId === id) {
        throw new BadRequestException('Cannot reassign consultants to the role being deleted.');
      }
      const target = await this.prisma.role.findUnique({
        where: { id: reassignToId },
        select: { name: true },
      });
      if (!target) {
        throw new BadRequestException(`Unknown role to reassign to: ${reassignToId}`);
      }
      const moved = await this.prisma.consultant.updateMany({
        where: { roleId: id },
        data: { roleId: reassignToId },
      });
      reassign = { toName: target.name, count: moved.count };
    }

    // RolePermission rows cascade on role delete.
    const deleted = await this.prisma.role.delete({ where: { id } });
    await this.logRoleChange('HARD_DELETE', id, actor, {
      name: existing.name,
      ...(reassign ? { reassignedTo: reassign.toName, reassignedCount: reassign.count } : {}),
    });
    return deleted;
  }

  /**
   * This role's saved versions, newest first — reshaped from its own
   * CREATE/UPDATE `AuditLog` rows rather than a dedicated versioning table:
   * every save already writes the full resulting name/description/
   * permissionIds (see `logRoleChange`'s callers), so each row here is
   * already a complete, restorable snapshot, not a diff. The first entry is
   * always the role's current state.
   */
  async history(id: string, limit: number) {
    const role = await this.prisma.role.findUnique({ where: { id }, select: { id: true } });
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    const logs = await this.prisma.auditLog.findMany({
      where: { entityType: 'Role', entityId: id, action: { in: ['CREATE', 'UPDATE'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // One shared actor lookup for the whole page, same shape as
    // AuditService.getPipelineTimeline's — not the full LabelResolverService,
    // which resolves many different foreign-key-shaped fields across every
    // entity type; here there's exactly one (actorId).
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter((v): v is string => !!v))];
    const actors = actorIds.length
      ? await this.prisma.consultant.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [];
    const actorNameById = new Map(actors.map((a) => [a.id, a.fullName]));

    return logs.map((log) => {
      const changes = log.changes as { name?: string; description?: string; permissionIds?: string[] } | null;
      return {
        id: log.id,
        action: log.action,
        actorId: log.actorId,
        actorName: log.actorId ? (actorNameById.get(log.actorId) ?? null) : null,
        name: changes?.name ?? null,
        description: changes?.description ?? null,
        permissionIds: changes?.permissionIds ?? null,
        createdAt: log.createdAt,
      };
    });
  }

  /**
   * Rolls back to a past save by replaying its snapshot through `update()` —
   * reuses every existing guard there (immutable/protected roles, the
   * escalation check) for free, and writes an ordinary new UPDATE audit row.
   * A restore is deliberately just another forward-moving, fully-audited
   * edit, not a destructive revert — nothing about the row being restored
   * from is touched or removed.
   */
  async restore(id: string, dto: RestoreRoleDto, actor: AuthUser) {
    const log = await this.prisma.auditLog.findUnique({ where: { id: dto.auditLogId } });
    if (!log || log.entityType !== 'Role' || log.entityId !== id) {
      throw new NotFoundException(`Version ${dto.auditLogId} not found for role ${id}`);
    }

    const changes = log.changes as { name?: string; description?: string; permissionIds?: string[] } | null;
    if (!changes?.permissionIds) {
      throw new BadRequestException({
        code: 'NOT_RESTORABLE',
        message: "This version didn't capture a permission set (a name/description-only save) and can't be restored.",
      });
    }

    return this.update(
      id,
      { name: changes.name, description: changes.description, permissionIds: changes.permissionIds },
      actor,
    );
  }

  /**
   * Writes an audit row for a role mutation. Explicit (not via the Prisma
   * extension) because RolesService runs on the base client and uses batch
   * transactions the audit hook can't wrap — see the two audit gaps in the docs.
   */
  private logRoleChange(action: string, roleId: string, actor: AuthUser, changes?: unknown) {
    return this.prisma.auditLog.create({
      data: {
        actorId: actor.consultantId,
        action,
        entityType: 'Role',
        entityId: roleId,
        changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
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
    const { permissions, _count, ...rest } = role;
    return {
      ...rest,
      consultantCount: _count.consultants,
      permissions: permissions.map((rp) => ({
        id: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
      })),
    };
  }
}
