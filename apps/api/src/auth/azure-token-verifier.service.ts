import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { TokenClaims } from './auth.types';

/**
 * Verifies an Azure AD (Entra ID) `id_token` against Microsoft's JWKS. Used
 * once, at login time (`POST /auth/login`), to independently confirm the
 * id_token the web app received really was issued by our tenant/app before
 * trusting its claims — the web server isn't trusted blindly. Per-request API
 * auth is handled separately by TokenService, which verifies our own JWTs.
 */
@Injectable()
export class AzureTokenVerifierService {
  private readonly logger = new Logger(AzureTokenVerifierService.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private issuer?: string;
  private audience?: string;

  constructor(private readonly config: ConfigService) {}

  private ensureConfigured() {
    if (this.jwks) return;

    const tenantId = this.config.get<string>('AZURE_TENANT_ID');
    const clientId = this.config.get<string>('AZURE_CLIENT_ID');
    if (!tenantId || !clientId) {
      throw new Error(
        'Azure auth is not configured: set AZURE_TENANT_ID and AZURE_CLIENT_ID.',
      );
    }

    this.jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
    this.issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    this.audience = clientId;
  }

  async verify(idToken: string): Promise<TokenClaims> {
    this.ensureConfigured();

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks!, {
        issuer: this.issuer,
        audience: this.audience,
      }));
    } catch (err) {
      this.logger.debug(`Azure id_token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired Microsoft sign-in token',
      });
    }

    // Prefer `oid` (Azure's stable object id, consistent across token types)
    // over `sub` (which can vary per-app for the same user).
    const sub = typeof payload.oid === 'string' ? payload.oid : payload.sub;
    if (!sub) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Token is missing a subject',
      });
    }

    return {
      sub,
      email:
        typeof payload.email === 'string'
          ? payload.email
          : typeof payload.preferred_username === 'string'
            ? payload.preferred_username
            : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  }
}
