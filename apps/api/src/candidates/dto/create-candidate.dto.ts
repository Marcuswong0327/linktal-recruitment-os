import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CandidateStatus } from '@prisma/client';

/** One entry in a candidate's work history (stored as JSONB). */
export class WorkHistoryItemDto {
  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ example: 'Production Manager' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'ISO date or free text', example: '2019-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO date or free text; omit if current', example: '2023-06' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class CreateCandidateDto {
  @ApiProperty({ description: 'Full name', example: 'John Smith' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Given name', example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  givenName?: string;

  @ApiPropertyOptional({ description: 'Family name', example: 'Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  familyName?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Mobile number', example: '+61 412 345 678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Australia' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Brisbane' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Industry ID (see /industries)' })
  @IsOptional()
  @IsString()
  industryId?: string;

  @ApiPropertyOptional({ description: 'Role type ID (see /candidate-role-types)' })
  @IsOptional()
  @IsString()
  roleTypeId?: string;

  @ApiPropertyOptional({ description: 'Current position', example: 'Production Manager' })
  @IsOptional()
  @IsString()
  currentPosition?: string;

  @ApiPropertyOptional({ description: 'Current company', example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  currentCompany?: string;

  @ApiPropertyOptional({ description: 'Years of experience', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional({ description: 'Salary expectation', example: '150K' })
  @IsOptional()
  @IsString()
  salaryExpectation?: string;

  @ApiPropertyOptional({ description: 'LinkedIn URL', example: 'https://linkedin.com/in/johnsmith' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Resume URL' })
  @IsOptional()
  @IsUrl()
  resumeUrl?: string;

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

  @ApiPropertyOptional({ description: 'Free-entry skill tags', type: String, isArray: true, example: ['CNC', 'Welding'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Status; defaults to COLD when omitted', enum: CandidateStatus, example: 'COLD' })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional({ description: 'Owning consultant ID' })
  @IsOptional()
  @IsString()
  consultantId?: string;
}
