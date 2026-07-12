import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStakeholderDto {
  @ApiProperty({ description: 'Client ID this stakeholder belongs to' })
  @IsString()
  clientId!: string;

  @ApiProperty({ description: 'Full name', example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Job title', example: 'Head of Talent' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'jane@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Mobile number', example: '+61 412 345 678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @ApiPropertyOptional({ description: 'Whether this contact is a decision maker', default: false })
  @IsOptional()
  @IsBoolean()
  isDecisionMaker?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
