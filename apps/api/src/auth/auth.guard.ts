import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { RequestContext } from '../common/request-context';
import { TokenService } from './token.service';

/**
 * Authenticates every request (globally) unless the route is @Public().
 * Verifies the Bearer JWT and attaches the role/permissions carried in its
 * claims to `request.user` for the PermissionsGuard and controllers — no DB
 * call here. Those claims are resolved fresh at login/refresh (see
 * RbacService.resolveById), so a role change or deactivation takes effect
 * within the access token's 15-minute lifetime, not instantly — see
 * AccessTokenClaims' doc for that trade-off.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
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
    // TokenService callers) and the role/permissions resolved at mint time —
    // build the principal from the token alone, no DB round trip per request.
    request.user = {
      consultantId: claims.sub,
      azureId: '',
      email: claims.email ?? null,
      fullName: claims.name ?? '',
      roleName: claims.roleName,
      isActive: true, // guaranteed by RbacService.assertActive at mint time
      permissions: new Set(claims.permissions),
      industryIds: claims.industryIds,
    };
    // Attribute any writes made while handling this request to the caller.
    RequestContext.setActor(request.user.consultantId);
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
