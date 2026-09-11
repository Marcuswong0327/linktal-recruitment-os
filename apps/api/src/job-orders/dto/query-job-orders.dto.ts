import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JobOrderQuality, JobOrderStatus } from '@prisma/client';

/**
 * Columns the list may be sorted by. Mostly ID, numeric counts, salary bounds,
 * dates, plus a few table columns with a useful order: `jobTitle` / `client`
 * (alphabetical via their relations), and `quality` (enum declaration order
 * LOW < MEDIUM < HIGH). Other categoricals (jobRoleType, location, status,
 * priorityLevel) stay filter-only.
 * `jobTitle` and `client` are handled specially in the service since they are
 * relations, not scalar columns `orderBy` can key on directly.
 */
export enum JobOrderSortField {
  displayId = 'displayId',
  jobTitle = 'jobTitle',
  client = 'client',
  quality = 'quality',
  openings = 'openings',
  filledCount = 'filledCount',
  salaryMin = 'salaryMin',
  salaryMax = 'salaryMax',
  receivedAt = 'receivedAt',
  closedAt = 'closedAt',
  createdAt = 'createdAt',
  // Denormalized on JobOrder, kept in sync by
  // SubmissionsService.recomputeJobOrderCounters — see that field's own
  // schema.prisma comment for why a plain relation aggregate can't do this.
  activeSubmissionCount = 'activeSubmissionCount',
  lastSubmittedAt = 'lastSubmittedAt',
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

  @ApiPropertyOptional({
    description: 'Filter by quality (one or more). Omit for all qualities.',
    enum: JobOrderQuality,
    isArray: true,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(JobOrderQuality, { each: true })
  qualities?: JobOrderQuality[];

  @ApiPropertyOptional({ description: 'Filter by client ID (exact match)' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description: 'Filter by client ID(s) — matches a job order for any of these clients.',
    type: [String],
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  clientIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by assigned consultant ID(s) — matches a job order any of these consultants are working.', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  consultantIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by job title ID(s) (see /job-titles)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  jobTitleIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by job role type ID(s) (see /job-role-types)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  jobRoleTypeIds?: string[];

  @ApiPropertyOptional({
    description:
      "Filter by location name (contains, case-insensitive) — matches the job order's own node only. Use locationIds to match descendants too.",
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description:
      'Filter by Location id(s). Selecting a country or state matches every job order beneath it, via the ancestor path.',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

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
