import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StakeholderStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateStakeholderDto {
  @ApiProperty({ description: 'Client ID this stakeholder belongs to' })
  @IsString()
  clientId!: string;

  @ApiPropertyOptional({ description: 'First name', example: 'Jane' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  // The company's words for the role vs. the consultant's classification of
  // it — both kept, deliberately (see JobTitle / StakeholderRoleType in
  // schema.prisma). Both are catalog ids: a title new to the catalog is
  // created through /job-titles first, not invented here on the way past.
  // When `roleTypeId` is omitted, one is derived from the title by keyword.
  @ApiPropertyOptional({ description: "Job title ID (see /job-titles) — the company's own words for the role" })
  @IsOptional()
  @IsString()
  jobTitleId?: string;

  @ApiPropertyOptional({
    description: 'Role type ID (see /stakeholder-role-types) — takes precedence over the title-derived classification',
  })
  @IsOptional()
  @IsString()
  roleTypeId?: string;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'jane@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Mobile number', example: '+61 412 345 678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @ApiPropertyOptional({ description: 'Free-text notes about this stakeholder' })
  @IsOptional()
  @IsString()
  generalDescription?: string;

  @ApiPropertyOptional({
    description:
      "Location ids this stakeholder covers. Matched against a consultant's scope on its own, independent of where the client sits.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coverageLocationIds?: string[];

  @ApiPropertyOptional({
    description: 'Relationship-warmth status; defaults to COLD when omitted. Distinct from isAccurate below.',
    enum: StakeholderStatus,
    example: 'COLD',
  })
  @IsOptional()
  @IsEnum(StakeholderStatus)
  status?: StakeholderStatus;

  @ApiPropertyOptional({
    description:
      "Whether these details have been verified. Omit for 'not yet checked' — which isn't the same as false.",
  })
  @IsOptional()
  @IsBoolean()
  isAccurate?: boolean;

  @ApiPropertyOptional({ description: 'What is wrong with the details, when isAccurate is false' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  inaccurateReason?: string;
}
