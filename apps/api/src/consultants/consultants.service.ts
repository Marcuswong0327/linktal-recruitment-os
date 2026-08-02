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
import { clearMismatchedConsultantAssignments } from '../common/scope';
import { CreateConsultantDto } from './dto/create-consultant.dto';
import { UpdateConsultantDto } from './dto/update-consultant.dto';
import { QueryConsultantsDto } from './dto/query-consultants.dto';

/**
 * Every read embeds the resolved role so the directory can show it, plus the
 * consultant's assigned industries (resolved to names/ids and stripped back
 * out in `toEntity` unless the caller holds `consultant_industry:read` — the
 * DB join is cheap enough to always fetch and just not expose).
 */
const withRole = {
  role: { select: { id: true, name: true } },
  industries: { select: { industryId: true, industry: { select: { name: true } } } },
} as const;
// Never return the bcrypt hash — these queries feed API responses directly.
const omitSecrets = { passwordHash: true } as const;

const ADMIN_ROLE = 'admin';
// Assigning either of these privileged roles is admin-only.
const PRIVILEGED_ROLES = [ADMIN_ROLE, 'manager'];

const CONSULTANT_INDUSTRY_READ = 'consultant_industry:read';

type ConsultantWithIndustries = {
  industries: { industryId: string; industry: { name: string } }[];
} & Record<string, unknown>;

/** Strips the raw `industries` join rows into `industries`/`industryIds`, or drops them entirely without the read permission. */
function toEntity<T extends ConsultantWithIndustries>(consultant: T, actor: AuthUser) {
  const { industries: industryRows, ...rest } = consultant;
  if (!actor.permissions.has(CONSULTANT_INDUSTRY_READ)) {
    return rest;
  }
  return {
    ...rest,
    industries: industryRows.map((ci) => ci.industry.name),
    industryIds: industryRows.map((ci) => ci.industryId),
  };
}

@Injectable()
export class ConsultantsService {
  constructor(@Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  async findAll(query: QueryConsultantsDto, actor: AuthUser) {
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

    return {
      data: data.map((c) => toEntity(c, actor)),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string, actor: AuthUser) {
    const consultant = await this.prisma.consultant.findUnique({
      where: { id },
      include: withRole,
      omit: omitSecrets,
    });
    if (!consultant) {
      throw new NotFoundException(`Consultant ${id} not found`);
    }
    return toEntity(consultant, actor);
  }

  async findByDisplayId(displayId: string, actor: AuthUser) {
    const consultant = await this.prisma.consultant.findUnique({
      where: { displayId },
      include: withRole,
      omit: omitSecrets,
    });
    if (!consultant) {
      throw new NotFoundException(`Consultant ${displayId} not found`);
    }
    return toEntity(consultant, actor);
  }

  async create(dto: CreateConsultantDto, actor: AuthUser) {
    if (!this.isAdmin(actor) && (await this.roleIsPrivileged(dto.roleId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an admin can assign the admin or manager role.',
      });
    }
    // displayId is assigned by the DB (Consultant_displayId_seq default).
    const created = await this.prisma.consultant.create({ data: dto, include: withRole, omit: omitSecrets });
    return toEntity(created, actor);
  }

  /**
   * Admin-only management of another consultant (role, active status, details).
   * Self-service name edits go through `updateOwnProfile` (`/consultants/me`),
   * not here. Guarded against self-lockout and removing the last active admin.
   */
  async update(id: string, dto: UpdateConsultantDto, actor: AuthUser) {
    const existing = await this.findOne(id, actor);

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

    const updated = await this.prisma.consultant.update({ where: { id }, data, include: withRole, omit: omitSecrets });
    return toEntity(updated, actor);
  }

  /**
   * "Deleting" a consultant deactivates them (isActive=false) rather than
   * removing the row — consultants own clients/job orders whose ownership
   * history we must keep, and deactivation already blocks login on every
   * request (RbacService.assertActive). Audited as DEACTIVATE by the extension.
   * Deactivation is an IAM change, so it's admin-only like `update`.
   */
  async remove(id: string, actor: AuthUser) {
    const existing = await this.findOne(id, actor);
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

    const deactivated = await this.prisma.consultant.update({
      where: { id },
      data: { isActive: false },
      include: withRole,
      omit: omitSecrets,
    });
    return toEntity(deactivated, actor);
  }

  /** Update the caller's own profile — name only; never role or active status. */
  async updateOwnProfile(id: string, fullName: string, actor: AuthUser) {
    await this.findOne(id, actor);
    const updated = await this.prisma.consultant.update({
      where: { id },
      data: { fullName },
      include: withRole,
      omit: omitSecrets,
    });
    return toEntity(updated, actor);
  }

  /**
   * Assign/replace the full set of industries a consultant is scoped to —
   * view/edit/remove is admin+manager only (`consultant_industry:update`,
   * enforced by the controller's @RequirePermission, so "not admin" below
   * always means manager). A dedicated method rather than folding into
   * `update()` above: that method is hardcoded admin-only regardless of what
   * the permission system grants, which would silently break "manager can
   * assign" — this has its own, different escalation rules instead:
   *  - An admin can assign to anyone except themselves.
   *  - A manager can assign to themselves, other managers, or consultants,
   *    but never to an admin account.
   */
  async setIndustries(id: string, industryIds: string[], actor: AuthUser) {
    const target = await this.prisma.consultant.findUnique({
      where: { id },
      select: { id: true, role: { select: { name: true } } },
    });
    if (!target) {
      throw new NotFoundException(`Consultant ${id} not found`);
    }

    const isSelf = id === actor.consultantId;
    const actorIsAdmin = this.isAdmin(actor);

    if (actorIsAdmin && isSelf) {
      throw new BadRequestException({
        code: 'CANNOT_MODIFY_SELF',
        message: 'Admins cannot assign industries to their own account.',
      });
    }
    if (!actorIsAdmin && target.role?.name === ADMIN_ROLE) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Managers cannot assign industries to admin accounts.',
      });
    }

    const uniqueIds = Array.from(new Set(industryIds));
    if (uniqueIds.length > 0) {
      const industries = await this.prisma.industry.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, isActive: true },
      });
      const found = new Map(industries.map((i) => [i.id, i.isActive]));
      const missing = uniqueIds.filter((iid) => !found.has(iid));
      if (missing.length > 0) {
        throw new BadRequestException({
          code: 'INVALID_INDUSTRY',
          message: `Unknown industry id(s): ${missing.join(', ')}`,
        });
      }
      const inactive = uniqueIds.filter((iid) => found.get(iid) === false);
      if (inactive.length > 0) {
        throw new BadRequestException({
          code: 'INACTIVE_INDUSTRY',
          message: `Inactive industry id(s): ${inactive.join(', ')}`,
        });
      }
    }

    const current = await this.prisma.consultantIndustry.findMany({
      where: { consultantId: id },
      select: { industryId: true },
    });
    const currentIds = new Set(current.map((c) => c.industryId));
    const nextIds = new Set(uniqueIds);
    const toAdd = uniqueIds.filter((iid) => !currentIds.has(iid));
    const toRemove = [...currentIds].filter((iid) => !nextIds.has(iid));

    // Individual top-level create/delete calls (never a nested relation write
    // on Consultant) so the generic audit extension actually sees and diffs
    // each row — see AUDITED_MODELS in prisma.extensions.ts.
    for (const industryId of toRemove) {
      await this.prisma.consultantIndustry.delete({
        where: { consultantId_industryId: { consultantId: id, industryId } },
      });
    }
    for (const industryId of toAdd) {
      await this.prisma.consultantIndustry.create({ data: { consultantId: id, industryId } });
    }

    if (toRemove.length > 0) {
      await clearMismatchedConsultantAssignments(this.prisma, id, toRemove);
    }

    return this.findOne(id, actor);
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
