import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, TokenClaims } from './auth.types';

const BCRYPT_ROUNDS = 10;

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
  passwordHash: string | null;
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
   * Registers (or links) email+password auth. If a Consultant already exists
   * by email — imported from Excel, or already Azure-linked — this attaches
   * a password to that same row (so they can sign in either way) rather than
   * creating a duplicate; it only fails if that row already has a password.
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
      this.assertActive(linked);
      return this.toAuthUser(linked);
    }

    const created = await this.createConsultant({
      email: input.email,
      fullName: input.fullName,
      passwordHash,
      roleId: (await this.roleByName(DEFAULT_ROLE))?.id,
    });
    return this.toAuthUser(created);
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

    return this.createConsultant({
      azureId: claims.sub,
      email: claims.email ?? `${claims.sub}@users.noreply.local`,
      fullName: claims.name ?? claims.email ?? 'New User',
      roleId: (await this.roleByName(DEFAULT_ROLE))?.id,
    });
  }

  /**
   * Creates a Consultant with the next sequential displayId
   * (consultant-0001, -0002, …), retrying on the rare collision when two
   * first-time sign-ins/registrations race for the same number.
   */
  private async createConsultant(
    data: Omit<Prisma.ConsultantCreateInput, 'displayId' | 'role'> & { roleId?: string | null },
  ): Promise<ConsultantWithRole> {
    const { roleId, ...rest } = data;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.consultant.create({
          data: { ...rest, roleId, displayId: await this.nextDisplayId() },
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
