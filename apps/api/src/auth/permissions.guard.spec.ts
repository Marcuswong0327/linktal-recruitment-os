import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from './auth.types';
import { PERMISSION_KEY } from './auth.decorators';
import { PermissionsGuard } from './permissions.guard';

function contextFor(user?: Partial<AuthUser>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWithRequired(
  required: { resource: string; action: string } | undefined,
): PermissionsGuard {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === PERMISSION_KEY ? required : undefined,
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  it('allows routes with no required permission', () => {
    const guard = guardWithRequired(undefined);
    expect(guard.canActivate(contextFor({ permissions: new Set() }))).toBe(true);
  });

  it('allows when the user has the required permission', () => {
    const guard = guardWithRequired({ resource: 'candidate', action: 'read' });
    const user = { permissions: new Set(['candidate:read']) };
    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('forbids when the user lacks the required permission', () => {
    const guard = guardWithRequired({ resource: 'candidate', action: 'delete' });
    const user = { permissions: new Set(['candidate:read']) };
    expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
  });

  it('forbids when there is no authenticated user', () => {
    const guard = guardWithRequired({ resource: 'candidate', action: 'read' });
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
