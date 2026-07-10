import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { JobOrderStatus } from '@prisma/client';

export class CreateJobOrderDto {
  @ApiProperty({ description: 'Client ID this job order belongs to' })
  @IsString()
  clientId!: string;

  @ApiProperty({ description: 'Job title', example: 'Production Manager' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  jobTitle!: string;

  @ApiPropertyOptional({ description: 'Owning consultant ID' })
  @IsOptional()
  @IsString()
  consultantId?: string;

  @ApiPropertyOptional({ description: 'Department', example: 'Operations' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Location', example: 'Brisbane' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Job type', example: 'Full-time' })
  @IsOptional()
  @IsString()
  jobType?: string;

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

  @ApiPropertyOptional({ description: 'Number of openings', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  openings?: number;

  @ApiPropertyOptional({ description: 'Number of openings already filled', example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  filledCount?: number;

  @ApiPropertyOptional({ description: 'Job description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Requirements' })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({ description: 'Status; defaults to ACTIVE when omitted', enum: JobOrderStatus, example: 'ACTIVE' })
  @IsOptional()
  @IsEnum(JobOrderStatus)
  status?: JobOrderStatus;

  @ApiPropertyOptional({ description: 'Priority: 1=High, 2=Medium, 3=Low', example: 2, default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priorityLevel?: number;
}
