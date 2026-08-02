import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CandidateStatus } from '@prisma/client';

/**
 * One entry in a candidate's work history (stored as JSONB).
 *
 * `period` is a single free-text field rather than start/end dates: the source
 * records it as "2020 - 2021 (1 year)" and never stores anything parseable.
 */
export class WorkHistoryItemDto {
  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ example: 'Production Manager' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Free text', example: '2020 - 2021 (1 year)' })
  @IsOptional()
  @IsString()
  period?: string;
}

export class CreateCandidateDto {
  @ApiPropertyOptional({ description: 'First name', example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Mobile number', example: '+61 412 345 678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  // Required, both of them — the two tiers the scope resolver can't work
  // without (see the SCOPING note in schema.prisma). Everything finer is
  // optional.
  @ApiProperty({
    description: 'Most specific known Location node (see /locations) — city if no suburb is known, and so on',
  })
  @IsString()
  locationId!: string;

  @ApiProperty({ description: 'Industry ID (see /industries)' })
  @IsString()
  industryId!: string;

  @ApiPropertyOptional({ description: 'Job role type ID (see /job-role-types)' })
  @IsOptional()
  @IsString()
  jobRoleTypeId?: string;

  @ApiPropertyOptional({
    description: "Title at their current employer, in the employer's own words",
    example: 'Production Manager',
  })
  @IsOptional()
  @IsString()
  currentRole?: string;

  @ApiPropertyOptional({ description: 'Current company', example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  currentCompany?: string;

  @ApiPropertyOptional({ description: 'LinkedIn URL', example: 'https://linkedin.com/in/johnsmith' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Seek Talent Search profile URL' })
  @IsOptional()
  @IsUrl()
  seekTalentUrl?: string;

  @ApiPropertyOptional({ description: 'Raw resume file URL — the original, as submitted' })
  @IsOptional()
  @IsUrl()
  rawResumeUrl?: string;

  @ApiPropertyOptional({ description: "Edited resume file URL — Linktal's own reformatted version" })
  @IsOptional()
  @IsUrl()
  editedResumeUrl?: string;

  @ApiPropertyOptional({ description: 'Work history entries', type: WorkHistoryItemDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkHistoryItemDto)
  workHistory?: WorkHistoryItemDto[];

  @ApiPropertyOptional({ description: 'Specialization IDs (see /specializations)', type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializationIds?: string[];

  @ApiPropertyOptional({ description: 'Status; defaults to COLD when omitted', enum: CandidateStatus, example: 'COLD' })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional({ description: 'Owning consultant ID' })
  @IsOptional()
  @IsString()
  consultantId?: string;
}
