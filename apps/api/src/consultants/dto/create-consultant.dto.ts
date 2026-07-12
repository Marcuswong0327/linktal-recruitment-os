import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConsultantDto {
  @ApiProperty({ description: 'Email address', example: 'jane@linktal.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Full name', example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Role ID to assign (from the Role table)' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Whether the consultant is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
