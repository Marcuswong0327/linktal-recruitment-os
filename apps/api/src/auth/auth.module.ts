import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AzureTokenVerifierService } from './azure-token-verifier.service';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from './rbac.service';
import { TokenService } from './token.service';

/**
 * Wires authentication + RBAC globally. Guard order matters: AuthGuard
 * (authenticate + attach user) runs before PermissionsGuard (authorize).
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AzureTokenVerifierService,
    TokenService,
    RbacService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TokenService, RbacService],
})
export class AuthModule {}
