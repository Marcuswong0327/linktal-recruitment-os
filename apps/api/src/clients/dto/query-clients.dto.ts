import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Columns the list may be sorted by. Deliberately narrow: ID, numeric fields,
 * date fields, and `quality` (a native Postgres enum, which sorts by
 * declaration order — LOW < MEDIUM < HIGH — rather than alphabetically, so
 * it's meaningfully ordinal unlike `status`). Free-text/non-ordinal
 * categorical columns (companyName, industry, country, city, status,
 * tobSigned) are exposed as filters instead, since sorting by them only
 * yields arbitrary alphabetical groupings.
 */
export enum ClientSortField {
  displayId = 'displayId',
  feePercentage = 'feePercentage',
  guaranteePeriod = 'guaranteePeriod',
  createdAt = 'createdAt',
  lastContactedAt = 'lastContactedAt',
  quality = 'quality',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

/**
 * Status filter for the list. Mirrors ClientStatus but adds ALL so callers
 * can opt out of the status filter entirely.
 */
export enum ClientStatusFilter {
  COLD = 'COLD',
  WARM = 'WARM',
  TRADED = 'TRADED',
  ALL = 'ALL',
}

/**
 * Quality filter for the list. Mirrors ClientQuality but adds ALL so callers
 * can opt out of the quality filter entirely.
 */
export enum ClientQualityFilter {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  ALL = 'ALL',
}

export class QueryClientsDto {
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
    description: 'Column to sort by. Defaults to most recently contacted.',
    enum: ClientSortField,
  })
  @IsOptional()
  @IsEnum(ClientSortField)
  sortBy?: ClientSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({
    description: 'Free-text search across companyName, displayId and website',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by status. Defaults to ALL (every status); pass a specific status to narrow.',
    enum: ClientStatusFilter,
    default: ClientStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(ClientStatusFilter)
  status: ClientStatusFilter = ClientStatusFilter.ALL;

  @ApiPropertyOptional({ description: 'Filter by industry (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ description: 'Filter by specialization (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({ description: 'Filter by country (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Filter by city (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by owning consultant ID (exact match)' })
  @IsOptional()
  @IsString()
  consultantId?: string;

  @ApiPropertyOptional({
    description: 'Filter by lead quality. Defaults to ALL (every quality); pass a specific value to narrow.',
    enum: ClientQualityFilter,
    default: ClientQualityFilter.ALL,
  })
  @IsOptional()
  @IsEnum(ClientQualityFilter)
  quality: ClientQualityFilter = ClientQualityFilter.ALL;

  @ApiPropertyOptional({ description: 'Filter by Terms of Business signed' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  tobSigned?: boolean;
}
