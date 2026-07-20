import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JobOrderQuality, JobOrderStatus } from '@prisma/client';

/**
 * Columns the list may be sorted by. Deliberately narrow: ID, numeric counts,
 * salary bounds, and dates — the things with a meaningful order. Categorical /
 * free-text columns (jobTitle, department, city, suburb, status, priorityLevel,
 * quality) are exposed as filters instead, since sorting by them only yields
 * arbitrary alphabetical groupings.
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

/** Normalizes a querystring value into an array — Express/Nest won't auto-array a lone `?key=x`. */
const toArray = ({ value }: { value: unknown }) => (Array.isArray(value) ? value : value === undefined ? value : [value]);

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
    description:
      'Column to sort by. Defaults to status ascending (Active first — JobOrderStatus is declared ACTIVE/PLACED/CLOSED/ON_HOLD, so a native-enum sort already puts Active first) then most recently received.',
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

  @ApiPropertyOptional({ description: 'Filter by status (one or more). Omit for all statuses.', enum: JobOrderStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(JobOrderStatus, { each: true })
  statuses?: JobOrderStatus[];

  @ApiPropertyOptional({ description: 'Filter by quality (one or more). Omit for all qualities.', enum: JobOrderQuality, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(JobOrderQuality, { each: true })
  qualities?: JobOrderQuality[];

  @ApiPropertyOptional({ description: 'Filter by client ID (exact match)' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filter by owning consultant ID(s). Ignored (overridden by the caller\'s own id) for the `consultant` role.', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  consultantIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by city (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by suburb (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  suburb?: string;

  @ApiPropertyOptional({ description: 'Filter by department (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Filter by priority level(s) (1=High, 2=Medium, 3=Low). Omit for all.', type: [Number] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(3, { each: true })
  priorityLevels?: number[];

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
