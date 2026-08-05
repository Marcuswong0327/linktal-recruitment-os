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
import { clearUncoveredConsultantAssignments } from '../common/scope';
import { CreateConsultantDto } from './dto/create-consultant.dto';
import { UpdateConsultantDto } from './dto/update-consultant.dto';
import { QueryConsultantsDto } from './dto/query-consultants.dto';

/**
 * Every read embeds the resolved role so the directory can show it, plus all
 * three arms of the consultant's assigned scope (resolved to names/ids and
 * stripped back out in `toEntity` unless the caller holds the matching
 * `*:read` — the DB joins are cheap enough to always fetch and just not
 * expose). Each arm is gated independently, because the three permissions are
 * independent resources.
 */
const withRole = {
  role: { select: { id: true, name: true } },
  industries: { select: { industryId: true, industry: { select: { name: true } } } },
  specializations: {
    select: { specializationId: true, specialization: { select: { name: true } } },
  },
  locations: { select: { locationId: true, location: { select: { name: true } } } },
} as const;
// Never return the bcrypt hash — these queries feed API responses directly.
const omitSecrets = { passwordHash: true } as const;

const ADMIN_ROLE = 'admin';
// Assigning either of these privileged roles is admin-only.
const PRIVILEGED_ROLES = [ADMIN_ROLE, 'manager'];

const CONSULTANT_INDUSTRY_READ = 'consultant_industry:read';
const CONSULTANT_SPECIALIZATION_READ = 'consultant_specialization:read';
const CONSULTANT_LOCATION_READ = 'consultant_location:read';

/** One row of the org-chart CTE — see `hierarchy`. */
export type ConsultantNode = {
  id: string;
  displayId: string;
  fullName: string;
  reportsToId: string | null;
  roleName: string | null;
  isActive: boolean;
  depth: number;
};

type ConsultantWithScope = {
  industries: { industryId: string; industry: { name: string } }[];
  specializations: { specializationId: string; specialization: { name: string } }[];
  locations: { locationId: string; location: { name: string } }[];
} & Record<string, unknown>;

/**
 * Strips the raw join rows into parallel name/id arrays per arm, dropping any
 * arm the caller can't read entirely (not just emptying it — an empty list
 * would read as "no grants", which is a materially different statement about a
 * consultant than "you can't see this").
 */
function toEntity<T extends ConsultantWithScope>(consultant: T, actor: AuthUser) {
  const { industries, specializations, locations, ...rest } = consultant;
  return {
    ...rest,
    ...(actor.permissions.has(CONSULTANT_INDUSTRY_READ)
      ? {
          industries: industries.map((ci) => ci.industry.name),
          industryIds: industries.map((ci) => ci.industryId),
        }
      : {}),
    ...(actor.permissions.has(CONSULTANT_SPECIALIZATION_READ)
      ? {
          specializations: specializations.map((cs) => cs.specialization.name),
          specializationIds: specializations.map((cs) => cs.specializationId),
        }
      : {}),
    ...(actor.permissions.has(CONSULTANT_LOCATION_READ)
      ? {
          locations: locations.map((cl) => cl.location.name),
          locationIds: locations.map((cl) => cl.locationId),
        }
      : {}),
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
    await this.assertCanAssignScope(id, actor, 'industries');

    const uniqueIds = Array.from(new Set(industryIds));
    if (uniqueIds.length > 0) {
      const industries = await this.prisma.industry.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, isActive: true },
      });
      this.assertScopeIdsValid(uniqueIds, industries, 'industry');
    }

    const current = await this.prisma.consultantIndustry.findMany({
      where: { consultantId: id },
      select: { industryId: true },
    });

    const { toRemove } = await this.applyScopeDiff(
      current.map((c) => c.industryId),
      uniqueIds,
      {
        remove: (industryId) =>
          this.prisma.consultantIndustry.delete({
            where: { consultantId_industryId: { consultantId: id, industryId } },
          }),
        add: (industryId) =>
          this.prisma.consultantIndustry.create({ data: { consultantId: id, industryId } }),
      },
    );

    // Dropping an industry can strand records assigned to this consultant —
    // but only if their locations don't still cover them, which is why the
    // re-check reads current grants rather than acting on `toRemove` directly.
    if (toRemove.length > 0) {
      await clearUncoveredConsultantAssignments(this.prisma, id);
    }

    return this.findOne(id, actor);
  }

  /**
   * Narrows the industry arm — see the SCOPING note in schema.prisma. Grants
   * are usually made at a parent Specialization ("Food"), which covers every
   * child ("Food Meat", "Food Bakery", ...) through `ancestorIds`, so this
   * list stays short and coarse.
   *
   * A specialization grant only means anything as a narrowing of an industry
   * grant the consultant already holds (schema.prisma's wildcard rule: "if a
   * consultant lists specific children under a parent they hold..."), so this
   * rejects outright if they hold no industries yet, and rejects any
   * specialization whose own industry isn't one of their current
   * `ConsultantIndustry` rows — a specialization grant can never dangle
   * without the industry it narrows.
   *
   * Same escalation rules and full-set-replace shape as `setIndustries`; no
   * assignment cascade, since nothing is assigned by specialization.
   */
  async setSpecializations(id: string, specializationIds: string[], actor: AuthUser) {
    await this.assertCanAssignScope(id, actor, 'specializations');

    const uniqueIds = Array.from(new Set(specializationIds));
    if (uniqueIds.length > 0) {
      const grantedIndustries = await this.prisma.consultantIndustry.findMany({
        where: { consultantId: id },
        select: { industryId: true },
      });
      const grantedIndustryIds = new Set(grantedIndustries.map((g) => g.industryId));
      if (grantedIndustryIds.size === 0) {
        throw new BadRequestException({
          code: 'NO_INDUSTRIES_ASSIGNED',
          message: 'Assign at least one industry before adding specializations.',
        });
      }

      const specializations = await this.prisma.specialization.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, isActive: true, industryId: true },
      });
      this.assertScopeIdsValid(uniqueIds, specializations, 'specialization');

      const outOfIndustry = specializations.filter((s) => !grantedIndustryIds.has(s.industryId));
      if (outOfIndustry.length > 0) {
        throw new BadRequestException({
          code: 'SPECIALIZATION_INDUSTRY_MISMATCH',
          message: `Specialization id(s) not under an industry this consultant holds: ${outOfIndustry
            .map((s) => s.id)
            .join(', ')}`,
        });
      }
    }

    const current = await this.prisma.consultantSpecialization.findMany({
      where: { consultantId: id },
      select: { specializationId: true },
    });

    await this.applyScopeDiff(
      current.map((c) => c.specializationId),
      uniqueIds,
      {
        remove: (specializationId) =>
          this.prisma.consultantSpecialization.delete({
            where: { consultantId_specializationId: { consultantId: id, specializationId } },
          }),
        add: (specializationId) =>
          this.prisma.consultantSpecialization.create({
            data: { consultantId: id, specializationId },
          }),
      },
    );

    return this.findOne(id, actor);
  }

  /**
   * The location arm. Takes **already-materialised** node ids at any level —
   * a desk label like "Brisbane GC QLD" arrives as two CITY ids, "All
   * Malaysia" as one COUNTRY id. Expanding a wildcard into concrete nodes is
   * the caller's job (the assignment form's, or the importer's), which is what
   * keeps every grant individually auditable and makes zero rows mean *not
   * configured* rather than *everything*.
   *
   * Location has no `isActive` column — it's a bulk-loaded GeoNames tree, not
   * a curated catalog — so only existence is checked.
   */
  async setLocations(id: string, locationIds: string[], actor: AuthUser) {
    await this.assertCanAssignScope(id, actor, 'locations');

    const uniqueIds = Array.from(new Set(locationIds));
    if (uniqueIds.length > 0) {
      const locations = await this.prisma.location.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      this.assertScopeIdsValid(uniqueIds, locations, 'location');
    }

    const current = await this.prisma.consultantLocation.findMany({
      where: { consultantId: id },
      select: { locationId: true },
    });

    const { toRemove } = await this.applyScopeDiff(
      current.map((c) => c.locationId),
      uniqueIds,
      {
        remove: (locationId) =>
          this.prisma.consultantLocation.delete({
            where: { consultantId_locationId: { consultantId: id, locationId } },
          }),
        add: (locationId) =>
          this.prisma.consultantLocation.create({ data: { consultantId: id, locationId } }),
      },
    );

    // Locations grant ownership now, same as industries — so narrowing a patch
    // can strand a record just as dropping an industry can, and needs the same
    // re-check. (Specializations still cascade nothing: they only ever narrow
    // the industry arm, never grant on their own.)
    if (toRemove.length > 0) {
      await clearUncoveredConsultantAssignments(this.prisma, id);
    }

    return this.findOne(id, actor);
  }

  /**
   * The escalation rules shared by all three scope-assignment endpoints:
   *  - An admin can assign to anyone except themselves.
   *  - A manager can assign to themselves, other managers, or consultants,
   *    but never to an admin account.
   *
   * The permission itself (`consultant_*:update`) is checked by the
   * controller's @RequirePermission, so "not admin" here always means manager.
   */
  private async assertCanAssignScope(id: string, actor: AuthUser, noun: string): Promise<void> {
    const target = await this.prisma.consultant.findUnique({
      where: { id },
      select: { id: true, role: { select: { name: true } } },
    });
    if (!target) {
      throw new NotFoundException(`Consultant ${id} not found`);
    }

    if (this.isAdmin(actor) && id === actor.consultantId) {
      throw new BadRequestException({
        code: 'CANNOT_MODIFY_SELF',
        message: `Admins cannot assign ${noun} to their own account.`,
      });
    }
    if (!this.isAdmin(actor) && target.role?.name === ADMIN_ROLE) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Managers cannot assign ${noun} to admin accounts.`,
      });
    }
  }

  /**
   * Rejects ids that don't exist, or that name a retired catalog row. Rows
   * without an `isActive` column (Location) are treated as active.
   */
  private assertScopeIdsValid(
    uniqueIds: string[],
    rows: { id: string; isActive?: boolean }[],
    noun: 'industry' | 'specialization' | 'location',
  ): void {
    const found = new Map(rows.map((r) => [r.id, r.isActive ?? true]));

    const missing = uniqueIds.filter((v) => !found.has(v));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: `INVALID_${noun.toUpperCase()}`,
        message: `Unknown ${noun} id(s): ${missing.join(', ')}`,
      });
    }
    const inactive = uniqueIds.filter((v) => found.get(v) === false);
    if (inactive.length > 0) {
      throw new BadRequestException({
        code: `INACTIVE_${noun.toUpperCase()}`,
        message: `Inactive ${noun} id(s): ${inactive.join(', ')}`,
      });
    }
  }

  /**
   * Turns a full-set replace into the minimum add/remove set, and applies it
   * as individual top-level create/delete calls — never a nested relation
   * write on Consultant — so the generic audit extension actually sees and
   * diffs each grant row (see AUDITED_MODELS in prisma.extensions.ts).
   * Removals run first so a swap can't transiently violate anything.
   */
  private async applyScopeDiff(
    currentIds: string[],
    nextIds: string[],
    ops: { remove: (id: string) => Promise<unknown>; add: (id: string) => Promise<unknown> },
  ): Promise<{ toAdd: string[]; toRemove: string[] }> {
    const current = new Set(currentIds);
    const next = new Set(nextIds);
    const toAdd = nextIds.filter((v) => !current.has(v));
    const toRemove = currentIds.filter((v) => !next.has(v));

    for (const value of toRemove) {
      await ops.remove(value);
    }
    for (const value of toAdd) {
      await ops.add(value);
    }
    return { toAdd, toRemove };
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

  /**
   * The org chart, or one person's subtree ("my team").
   *
   * **Presentation only — never a permission boundary.** Reporting to someone
   * grants them nothing: row visibility is decided solely by the industry /
   * location / ownership arms in `common/scope.ts`, and a manager already sees
   * everything regardless of who reports to them (see `docs/rbac-roles.md` §3).
   * Nothing in this method may be reused for access control.
   *
   * `depth` is the distance from the requested root, so the caller can render
   * indentation without walking the parent chain itself.
   */
  async hierarchy(rootId: string | undefined): Promise<ConsultantNode[]> {
    if (rootId) {
      const exists = await this.prisma.consultant.findUnique({
        where: { id: rootId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException(`Consultant ${rootId} not found`);
      }
    }

    // A recursive CTE rather than N queries or an in-memory tree walk: the
    // depth is unbounded (nothing stops a five-deep chain) and this stays one
    // round trip either way. `Prisma.sql` interpolation is parameterised, not
    // string-concatenated.
    //
    // The `cycle` guard is not paranoia: `reportsToId` is a self-referencing FK
    // with nothing preventing A -> B -> A, and without it a cycle would spin
    // until the connection died. The path array is dropped from the result.
    const rows = await this.prisma.$queryRaw<ConsultantNode[]>(Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT c.id, c."displayId", c."fullName", c."reportsToId", c."isActive",
               c."roleId", 0 AS depth, ARRAY[c.id] AS path
        FROM "Consultant" c
        WHERE ${rootId ? Prisma.sql`c.id = ${rootId}` : Prisma.sql`c."reportsToId" IS NULL`}
        UNION ALL
        SELECT c.id, c."displayId", c."fullName", c."reportsToId", c."isActive",
               c."roleId", tree.depth + 1, tree.path || c.id
        FROM "Consultant" c
        JOIN tree ON c."reportsToId" = tree.id
        WHERE NOT c.id = ANY(tree.path)
      )
      SELECT tree.id, tree."displayId", tree."fullName", tree."reportsToId",
             tree."isActive", tree.depth::int AS depth, r.name AS "roleName"
      FROM tree
      LEFT JOIN "Role" r ON r.id = tree."roleId"
      ORDER BY tree.depth, tree."fullName"
    `);

    return rows;
  }
}
