import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { TokenService } from './token.service';

function configWith(vars: Record<string, string>) {
  return { get: (key: string) => vars[key] } as unknown as ConfigService;
}

const SECRETS = {
  JWT_ACCESS_SECRET: 'access-secret-at-least-32-characters-long',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-32-characters-long',
};

describe('TokenService', () => {
  it('round-trips an access token', async () => {
    const service = new TokenService(configWith(SECRETS));
    const { token, expiresAt } = await service.signAccessToken({
      sub: 'azure-oid-1',
      email: 'a@b.com',
      name: 'A B',
    });

    const claims = await service.verifyAccessToken(token);
    expect(claims).toEqual({ sub: 'azure-oid-1', email: 'a@b.com', name: 'A B' });
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('round-trips a refresh token', async () => {
    const service = new TokenService(configWith(SECRETS));
    const token = await service.signRefreshToken('consultant-1');
    await expect(service.verifyRefreshToken(token)).resolves.toEqual({
      consultantId: 'consultant-1',
    });
  });

  it('rejects an access token signed with a different secret', async () => {
    const service = new TokenService(configWith(SECRETS));
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('someone')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('not-the-real-secret-not-the-real-secret'));

    await expect(service.verifyAccessToken(forged)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired access token', async () => {
    const service = new TokenService(configWith(SECRETS));
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('someone')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRETS.JWT_ACCESS_SECRET));

    await expect(service.verifyAccessToken(expired)).rejects.toThrow(UnauthorizedException);
  });

  it('does not accept a refresh token as an access token or vice versa', async () => {
    const service = new TokenService(configWith(SECRETS));
    const refreshToken = await service.signRefreshToken('consultant-1');
    await expect(service.verifyAccessToken(refreshToken)).rejects.toThrow(UnauthorizedException);

    const access = await service.signAccessToken({ sub: 'x' });
    await expect(service.verifyRefreshToken(access.token)).rejects.toThrow(UnauthorizedException);
  });
});
