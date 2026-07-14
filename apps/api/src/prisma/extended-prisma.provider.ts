import { Provider } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ExtendedPrismaClient, extendPrismaClient } from './prisma.extensions';

/**
 * Injection token for the soft-delete + audit-aware Prisma client. Feature
 * services inject this instead of PrismaService so their reads/writes are
 * filtered and audited automatically. It shares the base client's connection,
 * so PrismaService keeps owning `$connect`/`$disconnect` (see PrismaService).
 *
 * Auth services (RbacService, TokenService) deliberately keep the plain
 * PrismaService — the login path must see all consultants unfiltered.
 */
export const EXTENDED_PRISMA = Symbol('EXTENDED_PRISMA');

export const extendedPrismaProvider: Provider = {
  provide: EXTENDED_PRISMA,
  useFactory: (base: PrismaService): ExtendedPrismaClient => extendPrismaClient(base),
  inject: [PrismaService],
};
