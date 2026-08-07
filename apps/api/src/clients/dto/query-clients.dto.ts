import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClientQuality, ClientStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : value === undefined ? value : [value];

/**
 * Columns the list may be sorted by. Deliberately narrow: ID, date fields,
 * and `quality` (a native Postgres enum, which sorts by declaration order —
 * LOW < MEDIUM < HIGH — rather than alphabetically, so it's meaningfully
 * ordinal unlike `status`). Free-text/non-ordinal categorical columns
 * (companyName, industry, location, status) are exposed as filters instead,
 * since sorting by them only yields arbitrary alphabetical groupings. The
 * old fee/guarantee columns are gone: those terms live per-Tob now, and a
 * client can hold several that disagree.
 */
export enum ClientSortField {
  displayId = 'displayId',
  createdAt = 'createdAt',
  lastContactedAt = 'lastContactedAt',
  quality = 'quality',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
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
    description: 'Filter by status (one or more). Omit for all statuses.',
    enum: ClientStatus,
    isArray: true,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(ClientStatus, { each: true })
  statuses?: ClientStatus[];

  @ApiPropertyOptional({ description: 'Filter by industry (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ description: 'Filter by industry id(s) (one or more, exact match)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  industryIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by specialization (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({ description: 'Filter by specialization id(s) (one or more, exact match)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  specializationIds?: string[];

  @ApiPropertyOptional({
    description:
      'Filter by location name (contains, case-insensitive) — matches any node in the client\'s market set.',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description:
      "Filter by Location id(s). Selecting a country or state matches every client whose market sits beneath it, via the ancestor path.",
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @ApiPropertyOptional({
    description:
      "Filter by owning consultant ID(s) (one or more, exact match). '' selects unassigned clients.",
    type: [String],
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  consultantIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter by lead quality (one or more). Omit for all qualities.',
    enum: ClientQuality,
    isArray: true,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(ClientQuality, { each: true })
  qualities?: ClientQuality[];

  @ApiPropertyOptional({
    description:
      'Filter by whether the client has any Terms of Business on file. Replaces the old `tobSigned` flag — TOBs are their own one-to-many table now (see /tobs).',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  hasTob?: boolean;
}
