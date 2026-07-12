import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CandidateStatus } from '@prisma/client';

/**
 * Columns the list may be sorted by. Deliberately narrow: IDs, names, and
 * numeric fields — the things with a meaningful order. Categorical / free-text
 * columns (status, industry, roleType, country, city, currentCompany,
 * currentPosition, email) are exposed as filters instead, since sorting by them
 * only yields arbitrary alphabetical groupings.
 */
export enum CandidateSortField {
  displayId = 'displayId',
  fullName = 'fullName',
  familyName = 'familyName',
  givenName = 'givenName',
  yearsExperience = 'yearsExperience',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

/**
 * Status filter for the list. Mirrors CandidateStatus but adds ALL so callers
 * can opt out of the status filter entirely (the default narrows to PLACED).
 */
export enum CandidateStatusFilter {
  COLD = 'COLD',
  WARM = 'WARM',
  HOT = 'HOT',
  PLACED = 'PLACED',
  ALL = 'ALL',
}

export class QueryCandidatesDto {
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
    enum: CandidateSortField,
  })
  @IsOptional()
  @IsEnum(CandidateSortField)
  sortBy?: CandidateSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({
    description: 'Free-text search across fullName, email, currentCompany and displayId',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by status. Defaults to ALL (every status); pass a specific status to narrow.',
    enum: CandidateStatusFilter,
    default: CandidateStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(CandidateStatusFilter)
  status: CandidateStatusFilter = CandidateStatusFilter.ALL;

  @ApiPropertyOptional({ description: 'Filter by industry (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ description: 'Filter by role type (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  roleType?: string;

  @ApiPropertyOptional({ description: 'Filter by country (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Filter by city (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by current company (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  currentCompany?: string;

  @ApiPropertyOptional({ description: 'Filter by current position (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  currentPosition?: string;

  @ApiPropertyOptional({ description: 'Minimum years of experience (inclusive)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsExperienceMin?: number;

  @ApiPropertyOptional({ description: 'Maximum years of experience (inclusive)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsExperienceMax?: number;

  /** Convenience: resolve the effective Prisma status filter (undefined = no filter). */
  get statusFilter(): CandidateStatus | undefined {
    return this.status === CandidateStatusFilter.ALL
      ? undefined
      : (this.status as unknown as CandidateStatus);
  }
}
