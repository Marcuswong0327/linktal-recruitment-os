import { ApiProperty } from '@nestjs/swagger';

export class SessionUserEntity {
  @ApiProperty() consultantId!: string;
  @ApiProperty() email!: string | null;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) roleName!: string | null;
  @ApiProperty({ type: [String], description: "Flat 'resource:action' strings" })
  permissions!: string[];
}

export class LoginResponseEntity {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Epoch ms' }) accessTokenExpiresAt!: number;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ type: SessionUserEntity }) user!: SessionUserEntity;
}

export class RefreshResponseEntity {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Epoch ms' }) accessTokenExpiresAt!: number;
  @ApiProperty({ type: SessionUserEntity }) user!: SessionUserEntity;
}
