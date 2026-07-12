import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AzureTokenVerifierService } from './azure-token-verifier.service';

function configWith(vars: Record<string, string>) {
  return { get: (key: string) => vars[key] } as unknown as ConfigService;
}

describe('AzureTokenVerifierService', () => {
  it('throws a startup error when AZURE_TENANT_ID/AZURE_CLIENT_ID are missing', async () => {
    const service = new AzureTokenVerifierService(configWith({}));
    await expect(service.verify('whatever')).rejects.toThrow(
      'Azure auth is not configured',
    );
  });

  it('rejects a malformed token as unauthorized (not a JWT)', async () => {
    const service = new AzureTokenVerifierService(
      configWith({ AZURE_TENANT_ID: 'tenant-1', AZURE_CLIENT_ID: 'client-1' }),
    );
    await expect(service.verify('not-a-jwt')).rejects.toThrow(UnauthorizedException);
  });
});
