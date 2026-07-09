import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
<<<<<<< Updated upstream
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
=======
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';
>>>>>>> Stashed changes
import { CandidateStatus } from '@prisma/client';

export class CreateCandidateDto {
  @ApiProperty({ description: 'Display ID', example: 'CDD-0001' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  displayId!: string;

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
<<<<<<< Updated upstream

  @ApiPropertyOptional({ description: 'Country', example: 'Australia' })
=======

  @ApiPropertyOptional({ description: 'Country', example: 'Australia' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Brisbane' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Industry', example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ description: 'Role type', example: 'Production Lead' })
  @IsOptional()
  @IsString()
  roleType?: string;

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

  @ApiPropertyOptional({ description: 'Status', enum: CandidateStatus, example: 'COLD' })
>>>>>>> Stashed changes
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Brisbane' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Industry', example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  industry?: string;

<<<<<<< Updated upstream
  @ApiPropertyOptional({ description: 'Role type', example: 'Production Lead' })
  @IsOptional()
  @IsString()
  roleType?: string;

  @ApiPropertyOptional({ description: 'Current position', example: 'Production Manager' })
  @IsOptional()
  @IsString()
  currentPosition?: string;

  @ApiPropertyOptional({ description: 'Status', enum: CandidateStatus, example: 'COLD' })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;
=======
  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
>>>>>>> Stashed changes
}
