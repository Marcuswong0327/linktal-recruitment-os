import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from './rbac.service';
import { TokenVerifierService } from './token-verifier.service';

/**
 * Wires authentication + RBAC globally. Guard order matters: AuthGuard
 * (authenticate + attach user) runs before PermissionsGuard (authorize).
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    TokenVerifierService,
    RbacService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TokenVerifierService, RbacService],
})
export class AuthModule {}
