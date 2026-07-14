import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import { AccessTokenClaims } from './auth.types';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SignedToken {
  token: string;
  /** Epoch ms, for the web app's expiry-aware cache. */
  expiresAt: number;
}

export interface RefreshClaims {
  consultantId: string;
}

/**
 * Mints and verifies the API's own access/refresh JWTs. Issued once at login
 * (after Azure's id_token has been verified by AzureTokenVerifierService) and
 * on refresh; verified locally (HMAC, no network call) on every request by
 * AuthGuard. Access and refresh tokens use distinct secrets so leaking one
 * doesn't compromise the other.
 *
 * Stateless by design (no revocation table) — matches the project's current
 * minimalism (no Account/Session tables). Known trade-off: can't force a
 * server-side logout before a refresh token's natural expiry.
 */
@Injectable()
export class TokenService {
  private accessSecret?: Uint8Array;
  private refreshSecret?: Uint8Array;

  constructor(private readonly config: ConfigService) {}

  private getAccessSecret(): Uint8Array {
    if (!this.accessSecret) {
      const secret = this.config.get<string>('JWT_ACCESS_SECRET');
      if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured.');
      this.accessSecret = new TextEncoder().encode(secret);
    }
    return this.accessSecret;
  }

  private getRefreshSecret(): Uint8Array {
    if (!this.refreshSecret) {
      const secret = this.config.get<string>('JWT_REFRESH_SECRET');
      if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured.');
      this.refreshSecret = new TextEncoder().encode(secret);
    }
    return this.refreshSecret;
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<SignedToken> {
    const expiresAt = Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000;
    const token = await new SignJWT({
      email: claims.email,
      name: claims.name,
      roleName: claims.roleName,
      permissions: claims.permissions,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.getAccessSecret());
    return { token, expiresAt };
  }

  async signRefreshToken(consultantId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(consultantId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SECONDS)
      .sign(this.getRefreshSecret());
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.getAccessSecret());
      if (!payload.sub) throw new Error('missing subject');
      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        roleName: typeof payload.roleName === 'string' ? payload.roleName : null,
        permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
      };
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    }
  }

  async verifyRefreshToken(token: string): Promise<RefreshClaims> {
    try {
      const { payload } = await jwtVerify(token, this.getRefreshSecret());
      if (!payload.sub) throw new Error('missing subject');
      return { consultantId: payload.sub };
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }
  }
}
