import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import { AccessTokenClaims, AuthUser } from './auth.types';
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
  verify?: (t: string) => Promise<AccessTokenClaims>;
}) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? opts.isPublic : undefined,
  } as unknown as Reflector;
  const tokens = {
    verifyAccessToken: opts.verify ?? jest.fn(),
  } as unknown as TokenService;
  return new AuthGuard(reflector, tokens);
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

  it('verifies the token and attaches the user built from its claims', async () => {
    const guard = makeGuard({
      verify: async () => ({
        sub: 'c1',
        email: 'a@b.com',
        name: 'A B',
        roleName: 'viewer',
        permissions: ['candidate:read'],
      }),
    });

    const ctx = contextFor({ authorization: 'Bearer abc.def.ghi' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toEqual({
      consultantId: 'c1',
      azureId: '',
      email: 'a@b.com',
      fullName: 'A B',
      roleName: 'viewer',
      isActive: true,
      permissions: new Set(['candidate:read']),
    });
  });

  it('rejects a non-bearer authorization scheme', async () => {
    const guard = makeGuard({});
    await expect(
      guard.canActivate(contextFor({ authorization: 'Basic abc' })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
