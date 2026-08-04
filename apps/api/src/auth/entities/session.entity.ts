import { ApiProperty } from '@nestjs/swagger';

export class SessionUserEntity {
  @ApiProperty() consultantId!: string;
  @ApiProperty() email!: string | null;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) roleName!: string | null;
  @ApiProperty({ type: [String], description: "Flat 'resource:action' strings" })
  permissions!: string[];
  @ApiProperty({ type: [String], description: 'Industry ids this consultant is scoped to (only enforced for roleName === "consultant")' })
  industryIds!: string[];
  @ApiProperty({
    type: [String],
    description:
      'Specialization ids granted to this consultant. Narrows the industry arm; empty means the whole industry.',
  })
  specializationIds!: string[];
  @ApiProperty({
    type: [String],
    description:
      'Location ids granted to this consultant. Each covers that node and every descendant.',
  })
  locationIds!: string[];
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
