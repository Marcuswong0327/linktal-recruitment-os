import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { AuthUser } from './auth.types';

/** Marks a route as not requiring authentication (e.g. health check). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Declares the permission (`resource` + `action`) a route requires. */
export const PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action });

/**
 * Declares that a route requires EVERY one of several permissions (e.g. an
 * import endpoint that both creates and updates rows needs `:create` AND
 * `:update`). Stores an array under the same PERMISSION_KEY that
 * `RequirePermission` uses a single object under — `SetMetadata` on the same
 * key twice on one handler would silently overwrite rather than combine, so
 * this is the only correct way to express "requires more than one
 * permission," not two stacked `@RequirePermission` decorators.
 */
export const RequirePermissions = (...perms: { resource: string; action: string }[]) =>
  SetMetadata(PERMISSION_KEY, perms);

/** Injects the authenticated user resolved by AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
