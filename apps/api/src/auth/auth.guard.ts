import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { RbacService } from './rbac.service';
import { TokenService } from './token.service';

/**
 * Authenticates every request (globally) unless the route is @Public().
 * Verifies the Bearer JWT, resolves the app user + permissions, and attaches
 * them to `request.user` for the PermissionsGuard and controllers.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing bearer token',
      });
    }

    const claims = await this.tokens.verifyAccessToken(token);
    // Our own access tokens always carry the Consultant id as `sub` (see
    // TokenService callers) — resolve by primary key, not by re-running the
    // Azure-specific JIT-provisioning lookup on every request. resolveById
    // also rejects deactivated accounts (see RbacService.assertActive).
    request.user = await this.rbac.resolveById(claims.sub);
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
