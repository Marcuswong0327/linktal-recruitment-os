import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSION_KEY } from './auth.decorators';

type PermissionRequirement = { resource: string; action: string };

/**
 * Authorizes requests against the permission(s) declared via
 * @RequirePermission (single) or @RequirePermissions (every one of several —
 * see auth.decorators.ts's doc on why two stacked @RequirePermission
 * decorators can't express that). Runs after AuthGuard, so `request.user` is
 * populated. Routes without a required permission only need authentication
 * (already enforced upstream).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      PermissionRequirement | PermissionRequirement[] | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const requirements = Array.isArray(required) ? required : [required];

    const missing = requirements
      .map((r) => `${r.resource}:${r.action}`)
      .filter((permission) => !user?.permissions?.has(permission));

    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      });
    }
    return true;
  }
}
