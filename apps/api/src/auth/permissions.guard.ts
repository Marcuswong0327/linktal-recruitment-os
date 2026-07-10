import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSION_KEY } from './auth.decorators';

/**
 * Authorizes requests against the permission declared via @RequirePermission.
 * Runs after AuthGuard, so `request.user` is populated. Routes without a
 * required permission only need authentication (already enforced upstream).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      { resource: string; action: string } | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const permission = `${required.resource}:${required.action}`;

    if (!user?.permissions?.has(permission)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission: ${permission}`,
      });
    }
    return true;
  }
}
