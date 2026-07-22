import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth.decorators';
import { AzureTokenVerifierService } from './azure-token-verifier.service';
import { LoginDto } from './dto/login.dto';
import { PasswordLoginDto } from './dto/password-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginResponseEntity, RefreshResponseEntity } from './entities/session.entity';
import { AccessTokenClaims, AuthUser } from './auth.types';
import { RbacService } from './rbac.service';
import { TokenService } from './token.service';

/**
 * Issues and refreshes the API's own tokens, from either an Azure AD
 * id_token (verified independently — see AzureTokenVerifierService, the web
 * app is never trusted blindly) or email+password against the Consultant
 * table directly. Either way, our own access token's `sub` is always the
 * Consultant's id (see TokenClaims doc), not tied to the sign-in method.
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
    return this.issueSession(user);
  }

  @Post('register')
  @Public()
  @ApiOperation({ operationId: 'register', summary: 'Create (or link) an email+password account' })
  @ApiResponse({ status: 201, description: 'Registered and signed in', type: LoginResponseEntity })
  async register(@Body() dto: RegisterDto): Promise<LoginResponseEntity> {
    const user = await this.rbac.registerWithPassword(dto);
    return this.issueSession(user);
  }

  @Post('login-password')
  @Public()
  @ApiOperation({ operationId: 'loginPassword', summary: 'Sign in with email+password' })
  @ApiResponse({ status: 201, description: 'Signed in', type: LoginResponseEntity })
  async loginPassword(@Body() dto: PasswordLoginDto): Promise<LoginResponseEntity> {
    const user = await this.rbac.verifyPassword(dto.email, dto.password);
    return this.issueSession(user);
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
    const access = await this.tokens.signAccessToken(this.claimsFor(user));

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      user: {
        consultantId: user.consultantId,
        email: user.email,
        fullName: user.fullName,
        roleName: user.roleName,
        permissions: Array.from(user.permissions),
        industryIds: user.industryIds,
      },
    };
  }

  private async issueSession(user: AuthUser): Promise<LoginResponseEntity> {
    const access = await this.tokens.signAccessToken(this.claimsFor(user));
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
        industryIds: user.industryIds,
      },
    };
  }

  /** Our own access token's `sub` is always the Consultant id — see TokenClaims doc. */
  private claimsFor(user: AuthUser): AccessTokenClaims {
    return {
      sub: user.consultantId,
      email: user.email ?? undefined,
      name: user.fullName,
      roleName: user.roleName,
      permissions: Array.from(user.permissions),
      industryIds: user.industryIds,
    };
  }
}
