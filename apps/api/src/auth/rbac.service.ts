import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, TokenClaims } from './auth.types';

const DISPLAY_ID_PREFIX = 'consultant-';

// Role for brand-new users (unmatched email → freshly created).
const DEFAULT_ROLE = 'viewer';
// Role backfilled onto an existing imported consultant (matched by email) that
// has no role yet — they're real recruiters, so they get the consultant role.
const LINKED_DEFAULT_ROLE = 'consultant';

// Consultant + its role + the role's permissions, in one query.
const withRole = {
  role: { include: { permissions: { include: { permission: true } } } },
} as const;

type ConsultantWithRole = {
  id: string;
  azureId: string | null;
  email: string;
  fullName: string;
  isActive: boolean;
  role: {
    name: string;
    permissions: { permission: { resource: string; action: string } }[];
  } | null;
};

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Maps a verified token to the app user. `Consultant` is the identity+role
   * table (linked to Azure AD via `azureId`). A first-time user is
   * provisioned just-in-time with the default `viewer` role.
   */
  async resolveUser(claims: TokenClaims): Promise<AuthUser> {
    const consultant = await this.findOrProvision(claims);
    this.assertActive(consultant);
    return this.toAuthUser(consultant);
  }

  /**
   * Re-resolves a consultant by id (used on refresh, where we only have the
   * consultantId embedded in the refresh token, not a fresh set of claims) —
   * so a role change takes effect on the next refresh without a re-login.
   */
  async resolveById(consultantId: string): Promise<AuthUser> {
    const consultant = await this.prisma.consultant.findUnique({
      where: { id: consultantId },
      include: withRole,
    });
    if (!consultant) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Consultant no longer exists',
      });
    }
    this.assertActive(consultant);
    return this.toAuthUser(consultant);
  }

  /**
   * Rejects a deactivated consultant. `resolveUser` runs on every
   * authenticated request (AuthGuard calls it per-request, not just at
   * token-mint time), so deactivating someone takes effect immediately — no
   * separate revocation needed, despite refresh tokens being stateless.
   */
  private assertActive(consultant: ConsultantWithRole) {
    if (!consultant.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'This account has been deactivated',
      });
    }
  }

  private async findOrProvision(claims: TokenClaims): Promise<ConsultantWithRole> {
    const byAzureId = await this.prisma.consultant.findUnique({
      where: { azureId: claims.sub },
      include: withRole,
    });
    if (byAzureId) return byAzureId;

    // A consultant may already exist by email (e.g. from data import) without a
    // linked Azure account — link it rather than creating a duplicate. If that
    // imported row has no role yet, give it the default so the user isn't left
    // with zero permissions on first login.
    if (claims.email) {
      const byEmail = await this.prisma.consultant.findUnique({
        where: { email: claims.email },
        include: withRole,
      });
      if (byEmail) {
        return this.prisma.consultant.update({
          where: { id: byEmail.id },
          data: {
            azureId: claims.sub,
            ...(byEmail.role
              ? {}
              : { roleId: (await this.roleByName(LINKED_DEFAULT_ROLE))?.id }),
          },
          include: withRole,
        });
      }
    }

    const data = {
      azureId: claims.sub,
      email: claims.email ?? `${claims.sub}@users.noreply.local`,
      fullName: claims.name ?? claims.email ?? 'New User',
      roleId: (await this.roleByName(DEFAULT_ROLE))?.id,
    };

    // Assign the next sequential displayId (consultant-0001, -0002, …). Retry on
    // the rare collision when two first-time sign-ins race for the same number.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.consultant.create({
          data: { ...data, displayId: await this.nextDisplayId() },
          include: withRole,
        });
      } catch (err) {
        if (attempt < 5 && this.isDisplayIdConflict(err)) continue;
        throw err;
      }
    }
  }

  private async roleByName(name: string) {
    const role = await this.prisma.role.findUnique({ where: { name } });
    if (!role) {
      this.logger.error(`Role "${name}" not found — run the RBAC seed.`);
    }
    return role;
  }

  /** Next `consultant-XXXX` id: max existing number + 1, zero-padded to 4. */
  private async nextDisplayId(): Promise<string> {
    const rows = await this.prisma.consultant.findMany({
      where: { displayId: { startsWith: DISPLAY_ID_PREFIX } },
      select: { displayId: true },
    });
    const max = rows.reduce((m, { displayId }) => {
      const n = Number.parseInt(displayId.slice(DISPLAY_ID_PREFIX.length), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `${DISPLAY_ID_PREFIX}${String(max + 1).padStart(4, '0')}`;
  }

  private isDisplayIdConflict(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      (err.meta?.target as string[] | undefined)?.includes('displayId') === true
    );
  }

  private toAuthUser(consultant: ConsultantWithRole): AuthUser {
    const permissions = new Set(
      consultant.role?.permissions.map(
        (rp) => `${rp.permission.resource}:${rp.permission.action}`,
      ) ?? [],
    );

    return {
      consultantId: consultant.id,
      azureId: consultant.azureId ?? '',
      email: consultant.email,
      fullName: consultant.fullName,
      roleName: consultant.role?.name ?? null,
      permissions,
    };
  }
}
