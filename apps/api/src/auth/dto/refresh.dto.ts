import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token issued by POST /auth/login' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
