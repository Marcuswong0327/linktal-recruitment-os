import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, TokenClaims } from './auth.types';

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
  neonUserId: string | null;
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
   * table (linked to Neon Auth via `neonUserId`). A first-time user is
   * provisioned just-in-time with the default `viewer` role.
   */
  async resolveUser(claims: TokenClaims): Promise<AuthUser> {
    const consultant = await this.findOrProvision(claims);
    return this.toAuthUser(consultant);
  }

  private async findOrProvision(claims: TokenClaims): Promise<ConsultantWithRole> {
    const byNeonId = await this.prisma.consultant.findUnique({
      where: { neonUserId: claims.sub },
      include: withRole,
    });
    if (byNeonId) return byNeonId;

    // A consultant may already exist by email (e.g. from data import) without a
    // linked Neon account — link it rather than creating a duplicate. If that
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
            neonUserId: claims.sub,
            ...(byEmail.role
              ? {}
              : { roleId: (await this.roleByName(LINKED_DEFAULT_ROLE))?.id }),
          },
          include: withRole,
        });
      }
    }

    // displayId is assigned by the DB (Consultant_displayId_seq default).
    return this.prisma.consultant.create({
      data: {
        neonUserId: claims.sub,
        email: claims.email ?? `${claims.sub}@users.noreply.local`,
        fullName: claims.name ?? claims.email ?? 'New User',
        roleId: (await this.roleByName(DEFAULT_ROLE))?.id,
      },
      include: withRole,
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
      neonUserId: consultant.neonUserId ?? '',
      email: consultant.email,
      fullName: consultant.fullName,
      roleName: consultant.role?.name ?? null,
      isActive: consultant.isActive,
      permissions,
    };
  }
}
