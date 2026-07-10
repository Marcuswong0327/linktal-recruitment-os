import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { TokenClaims } from './auth.types';

/**
 * Verifies Neon Auth JWTs against the issuer's JWKS (public keys). This is the
 * single point of contact with Neon Auth — swap this out to change how tokens
 * are validated (e.g. to session lookups) without touching the guards.
 *
 * The JWKS URL defaults to `${NEON_AUTH_BASE_URL}/jwks` but can be overridden
 * with NEON_AUTH_JWKS_URL. jose caches and rotates the keys automatically.
 */
@Injectable()
export class TokenVerifierService {
  private readonly logger = new Logger(TokenVerifierService.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  // The token's `iss`/`aud` is the origin of NEON_AUTH_BASE_URL (without its
  // path), e.g. base `https://…neon.tech/neondb/auth` -> issuer `https://…neon.tech`.
  private issuer?: string;

  constructor(private readonly config: ConfigService) {}

  private ensureConfigured() {
    if (this.jwks) return;

    const explicit = this.config.get<string>('NEON_AUTH_JWKS_URL');
    const base = this.config.get<string>('NEON_AUTH_BASE_URL');
    // Neon Auth serves the key set at `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`.
    const url =
      explicit ??
      (base ? `${base.replace(/\/$/, '')}/.well-known/jwks.json` : undefined);
    if (!url) {
      throw new Error(
        'Auth is not configured: set NEON_AUTH_JWKS_URL or NEON_AUTH_BASE_URL.',
      );
    }

    this.jwks = createRemoteJWKSet(new URL(url));
    this.issuer = base ? new URL(base).origin : undefined;
  }

  async verify(token: string): Promise<TokenClaims> {
    this.ensureConfigured();

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(
        token,
        this.jwks!,
        this.issuer ? { issuer: this.issuer, audience: this.issuer } : {},
      ));
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    }

    if (!payload.sub) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Token is missing a subject',
      });
    }

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  }
}
