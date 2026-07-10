import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Columns the list may be sorted by. Deliberately narrow: ID, numeric counts,
 * salary bounds, and dates — the things with a meaningful order. Categorical /
 * free-text columns (jobTitle, department, location, jobType, status,
 * priorityLevel) are exposed as filters instead, since sorting by them only
 * yields arbitrary alphabetical groupings.
 */
export enum JobOrderSortField {
  displayId = 'displayId',
  openings = 'openings',
  filledCount = 'filledCount',
  salaryMin = 'salaryMin',
  salaryMax = 'salaryMax',
  receivedAt = 'receivedAt',
  closedAt = 'closedAt',
  createdAt = 'createdAt',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

/**
 * Status filter for the list. Mirrors JobOrderStatus but adds ALL so callers
 * can opt out of the status filter entirely.
 */
export enum JobOrderStatusFilter {
  ACTIVE = 'ACTIVE',
  PLACED = 'PLACED',
  CLOSED = 'CLOSED',
  ON_HOLD = 'ON_HOLD',
  ALL = 'ALL',
}

export class QueryJobOrdersDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({
    description: 'Column to sort by. Defaults to most recently created.',
    enum: JobOrderSortField,
  })
  @IsOptional()
  @IsEnum(JobOrderSortField)
  sortBy?: JobOrderSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({
    description: 'Free-text search across jobTitle, displayId and description',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by status. Defaults to ALL (every status); pass a specific status to narrow.',
    enum: JobOrderStatusFilter,
    default: JobOrderStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(JobOrderStatusFilter)
  status: JobOrderStatusFilter = JobOrderStatusFilter.ALL;

  @ApiPropertyOptional({ description: 'Filter by client ID (exact match)' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filter by consultant ID (exact match)' })
  @IsOptional()
  @IsString()
  consultantId?: string;

  @ApiPropertyOptional({ description: 'Filter by job type (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  jobType?: string;

  @ApiPropertyOptional({ description: 'Filter by location (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Filter by department (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Filter by priority level (1=High, 2=Medium, 3=Low)', minimum: 1, maximum: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  priorityLevel?: number;

  @ApiPropertyOptional({ description: 'Minimum salary (matches salaryMax >= value)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ description: 'Maximum salary (matches salaryMin <= value)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;
}
