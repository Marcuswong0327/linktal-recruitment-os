import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth.decorators';
import { AzureTokenVerifierService } from './azure-token-verifier.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LoginResponseEntity, RefreshResponseEntity } from './entities/session.entity';
import { RbacService } from './rbac.service';
import { TokenService } from './token.service';

/**
 * Issues and refreshes the API's own tokens. The web app never sends us a
 * password or an Azure access token — only the id_token it already got back
 * from its own NextAuth/Azure OAuth exchange, which we re-verify ourselves
 * (see AzureTokenVerifierService) before trusting anything in it.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly azure: AzureTokenVerifierService,
    private readonly rbac: RbacService,
    private readonly tokens: TokenService,
  ) {}

  @Post('login')
  @Public()
  @ApiOperation({
    operationId: 'login',
    summary: "Exchange a verified Azure AD id_token for the API's own access/refresh tokens",
  })
  @ApiResponse({ status: 201, description: 'Signed in', type: LoginResponseEntity })
  async login(@Body() dto: LoginDto): Promise<LoginResponseEntity> {
    const claims = await this.azure.verify(dto.idToken);
    const user = await this.rbac.resolveUser(claims);
    const access = await this.tokens.signAccessToken(claims);
    const refreshToken = await this.tokens.signRefreshToken(user.consultantId);

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      user: {
        consultantId: user.consultantId,
        email: user.email,
        fullName: user.fullName,
        roleName: user.roleName,
        permissions: Array.from(user.permissions),
      },
    };
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ operationId: 'refresh', summary: 'Mint a new access token from a refresh token' })
  @ApiResponse({ status: 201, description: 'Refreshed', type: RefreshResponseEntity })
  async refresh(@Body() dto: RefreshDto): Promise<RefreshResponseEntity> {
    const { consultantId } = await this.tokens.verifyRefreshToken(dto.refreshToken);
    // Re-resolve (not just re-trust the old claims) so a role/permission
    // change or deactivation is reflected in the returned user, not just
    // enforced silently on the API side.
    const user = await this.rbac.resolveById(consultantId);
    const access = await this.tokens.signAccessToken({
      sub: user.azureId,
      email: user.email ?? undefined,
      name: user.fullName,
    });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      user: {
        consultantId: user.consultantId,
        email: user.email,
        fullName: user.fullName,
        roleName: user.roleName,
        permissions: Array.from(user.permissions),
      },
    };
  }
}
