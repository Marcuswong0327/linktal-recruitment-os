import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, TokenClaims } from './auth.types';

const BCRYPT_ROUNDS = 10;

// Role for brand-new users (unmatched email → freshly created).
const DEFAULT_ROLE = 'viewer';
// Role backfilled onto an existing imported consultant (matched by email) that
// has no role yet — they're real recruiters, so they get the consultant role.
const LINKED_DEFAULT_ROLE = 'consultant';

// Consultant + its role + the role's permissions + all three arms of its
// visibility scope, in one query. Only the granted node ids are loaded —
// descendants are resolved at query time via each tree's `ancestorIds`
// (see common/scope.ts), so a COUNTRY grant stays one id here, not 1,500.
const withRole = {
  role: { include: { permissions: { include: { permission: true } } } },
  industries: { select: { industryId: true } },
  specializations: { select: { specializationId: true } },
  locations: { select: { locationId: true } },
} as const;

type ConsultantWithRole = {
  id: string;
  azureId: string | null;
  passwordHash: string | null;
  email: string;
  fullName: string;
  isActive: boolean;
  role: {
    name: string;
    permissions: { permission: { resource: string; action: string } }[];
  } | null;
  industries: { industryId: string }[];
  specializations: { specializationId: string }[];
  locations: { locationId: string }[];
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
    await this.stampLastLogin(consultant.id);
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
   * Registers (or links) email+password auth. If a Consultant already exists
   * by email — imported from Excel, or already Azure-linked — this attaches
   * a password to that same row (so they can sign in either way) rather than
   * creating a duplicate; it only fails if that row already has a password.
   * That row's isActive is left untouched — it's already a known consultant.
   *
   * A brand-new signup, by contrast, is always created inactive and rejected
   * immediately (no session issued) pending admin approval — registration
   * never proves the submitter actually owns the email address (even an
   * @linktal.com.au one), so no domain gets auto-activated.
   */
  async registerWithPassword(input: { email: string; password: string; fullName: string }): Promise<AuthUser> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const existing = await this.prisma.consultant.findUnique({
      where: { email: input.email },
      include: withRole,
    });

    if (existing) {
      if (existing.passwordHash) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'An account with this email already exists',
        });
      }
      const linked = await this.prisma.consultant.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          ...(existing.role ? {} : { roleId: (await this.roleByName(LINKED_DEFAULT_ROLE))?.id }),
        },
        include: withRole,
      });
      await this.logProvisioning('UPDATE', linked.id, 'password-link');
      this.assertActive(linked);
      await this.stampLastLogin(linked.id);
      return this.toAuthUser(linked);
    }

    await this.createConsultant(
      {
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        roleId: (await this.roleByName(DEFAULT_ROLE))?.id,
        isActive: false,
        pendingApproval: true,
      },
      'password-registration',
    );

    // The row is created first, then rejected — deliberately. Registration
    // never proves the submitter owns the address, so the account exists but
    // stays dormant until an admin activates it. Same in every environment.
    throw new ForbiddenException({
      code: 'ACCOUNT_PENDING_APPROVAL',
      message: 'Your account has been created and is pending admin approval.',
    });
  }

  /**
   * Verifies email+password. Returns the same "invalid email or password"
   * error whether the email doesn't exist, has no password set, or the
   * password is wrong — doesn't leak which emails are registered.
   */
  async verifyPassword(email: string, password: string): Promise<AuthUser> {
    const consultant = await this.prisma.consultant.findUnique({ where: { email }, include: withRole });
    const invalid = () =>
      new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });

    if (!consultant?.passwordHash) throw invalid();
    if (!(await bcrypt.compare(password, consultant.passwordHash))) throw invalid();

    this.assertActive(consultant);
    await this.stampLastLogin(consultant.id);
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

  /**
   * Only called from a path that actually mints a session (Azure sign-in,
   * password login, or the password-link that immediately returns one) —
   * never on token refresh (`resolveById`) and never from
   * `registerWithPassword`'s brand-new-signup branch, which is rejected
   * before a session exists. Fire-and-forget from the caller's perspective;
   * awaited here only so a failure surfaces instead of racing the response.
   */
  private stampLastLogin(consultantId: string) {
    return this.prisma.consultant.update({
      where: { id: consultantId },
      data: { lastLoginAt: new Date() },
    });
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
        const linked = await this.prisma.consultant.update({
          where: { id: byEmail.id },
          data: {
            azureId: claims.sub,
            ...(byEmail.role
              ? {}
              : { roleId: (await this.roleByName(LINKED_DEFAULT_ROLE))?.id }),
          },
          include: withRole,
        });
        await this.logProvisioning('UPDATE', linked.id, 'azure-link');
        return linked;
      }
    }

    return this.createConsultant(
      {
        azureId: claims.sub,
        email: claims.email ?? `${claims.sub}@users.noreply.local`,
        fullName: claims.name ?? claims.email ?? 'New User',
        roleId: (await this.roleByName(DEFAULT_ROLE))?.id,
      },
      'azure-jit',
    );
  }

  // displayId is assigned by the DB (Consultant_displayId_seq default).
  // isActive is omitted for Azure provisioning (defaults to true — SSO
  // already implies Microsoft vetted them) and set explicitly to false for
  // email+password signups, which never prove email ownership.
  private async createConsultant(
    data: {
      azureId?: string;
      email: string;
      fullName: string;
      passwordHash?: string;
      roleId?: string | null;
      isActive?: boolean;
      pendingApproval?: boolean;
    },
    source: string,
  ): Promise<ConsultantWithRole> {
    const consultant = await this.prisma.consultant.create({ data, include: withRole });
    await this.logProvisioning('CREATE', consultant.id, source);
    return consultant;
  }

  /**
   * Gap 2: the auth path runs on the base client (never the audited extension —
   * it must read every consultant unfiltered and can't log on every request),
   * so provisioning writes are audited explicitly here. The actor is the
   * consultant themselves (self-provisioned during their own sign-in/register).
   */
  private logProvisioning(action: 'CREATE' | 'UPDATE', consultantId: string, source: string) {
    return this.prisma.auditLog.create({
      data: {
        actorId: consultantId,
        action,
        entityType: 'Consultant',
        entityId: consultantId,
        metadata: { source },
      },
    });
  }

  private async roleByName(name: string) {
    const role = await this.prisma.role.findUnique({ where: { name } });
    if (!role) {
      this.logger.error(`Role "${name}" not found — run the RBAC seed.`);
    }
    return role;
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
      isActive: consultant.isActive,
      permissions,
      industryIds: consultant.industries.map((ci) => ci.industryId),
      specializationIds: consultant.specializations.map((cs) => cs.specializationId),
      locationIds: consultant.locations.map((cl) => cl.locationId),
    };
  }
}
