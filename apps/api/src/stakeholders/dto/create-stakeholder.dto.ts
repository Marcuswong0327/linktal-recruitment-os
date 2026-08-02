import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
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

  @ApiPropertyOptional({ description: 'Role type ID (see /stakeholder-role-types)' })
  @IsOptional()
  @IsString()
  roleTypeId?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'jane@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Mobile number', example: '+61 412 345 678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @ApiPropertyOptional({
    description:
      'Location ids this stakeholder covers. Matched against a consultant\'s scope on its own, independent of where the client sits.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coverageLocationIds?: string[];

}
