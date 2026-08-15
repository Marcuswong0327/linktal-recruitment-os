import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JobOrderQuality, JobOrderStatus } from '@prisma/client';

export class CreateJobOrderDto {
  @ApiProperty({ description: 'Client ID this job order belongs to' })
  @IsString()
  clientId!: string;

  // Both kept, deliberately: the client's brief vs. the consultant's own
  // classification of the same job (see JobTitle / JobRoleType in
  // schema.prisma). Both are catalog ids — a title new to the catalog is
  // created through /job-titles first, not invented here on the way past.
  @ApiPropertyOptional({ description: "Job title ID (see /job-titles) — the client's own words for the role" })
  @IsOptional()
  @IsString()
  jobTitleId?: string;

  @ApiPropertyOptional({ description: "Job role type ID (see /job-role-types) — the consultant's classification" })
  @IsOptional()
  @IsString()
  jobRoleTypeId?: string;

  @ApiPropertyOptional({
    description:
      'Consultants working this job order at creation time (see PUT /job-orders/:id/consultants to change it later). Several can work the same job order concurrently — no scope check is applied here on purpose.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  consultantIds?: string[];

  @ApiPropertyOptional({
    description: 'Most specific known Location node (see /locations) — replaces the old city/suburb columns',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'ClientJobResearch row this job order originated from, if any (see /job-research)',
  })
  @IsOptional()
  @IsString()
  jobResearchId?: string;

  @ApiPropertyOptional({ description: 'Minimum salary', example: 120000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ description: 'Maximum salary', example: 150000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ description: 'Salary currency', example: 'AUD', default: 'AUD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  salaryCurrency?: string;

  @ApiPropertyOptional({
    description: 'Forecast value of this job order, entered before anyone is placed — distinct from a Placement fee',
    example: 25000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedValue?: number;

  @ApiPropertyOptional({ description: 'Number of openings', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  openings?: number;

  @ApiPropertyOptional({ description: 'Job description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Requirements' })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({
    description: 'Briefing notes — internal, distinct from the public-facing description/requirements copy',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Status; defaults to ACTIVE when omitted', enum: JobOrderStatus, example: 'ACTIVE' })
  @IsOptional()
  @IsEnum(JobOrderStatus)
  status?: JobOrderStatus;

  @ApiPropertyOptional({ description: 'Quality of the job order/posting; defaults to MEDIUM when omitted', enum: JobOrderQuality, example: 'MEDIUM' })
  @IsOptional()
  @IsEnum(JobOrderQuality)
  quality?: JobOrderQuality;

  @ApiPropertyOptional({ description: 'Priority: 1=High, 2=Medium, 3=Low', example: 2, default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priorityLevel?: number;
}
