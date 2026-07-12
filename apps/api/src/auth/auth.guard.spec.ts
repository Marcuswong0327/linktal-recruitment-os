import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import { AuthUser, TokenClaims } from './auth.types';
import { RbacService } from './rbac.service';
import { TokenService } from './token.service';

function contextFor(headers: Record<string, string>): ExecutionContext {
  const req = { headers } as { headers: Record<string, string>; user?: AuthUser };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(opts: {
  isPublic?: boolean;
  verify?: (t: string) => Promise<TokenClaims>;
  resolve?: (consultantId: string) => Promise<AuthUser>;
}) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? opts.isPublic : undefined,
  } as unknown as Reflector;
  const tokens = {
    verifyAccessToken: opts.verify ?? jest.fn(),
  } as unknown as TokenService;
  const rbac = { resolveById: opts.resolve ?? jest.fn() } as unknown as RbacService;
  return new AuthGuard(reflector, tokens, rbac);
}

describe('AuthGuard', () => {
  it('allows public routes without a token', async () => {
    const guard = makeGuard({ isPublic: true });
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('rejects when no bearer token is present', async () => {
    const guard = makeGuard({});
    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('verifies the token and attaches the resolved user', async () => {
    const user = {
      consultantId: 'c1',
      azureId: 'u1',
      email: 'a@b.com',
      fullName: 'A B',
      roleName: 'viewer',
      isActive: true,
      permissions: new Set(['candidate:read']),
    } as AuthUser;
    const guard = makeGuard({
      verify: async () => ({ sub: 'c1', email: 'a@b.com' }),
      resolve: async () => user,
    });

    const ctx = contextFor({ authorization: 'Bearer abc.def.ghi' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toBe(user);
  });

  it('rejects a non-bearer authorization scheme', async () => {
    const guard = makeGuard({});
    await expect(
      guard.canActivate(contextFor({ authorization: 'Basic abc' })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
