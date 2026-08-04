import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClientStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Columns the list may be sorted by. Deliberately narrow: ID and the dates
 * with a meaningful order. Categorical / free-text columns (jobTitle,
 * jobRoleType, location, status) are exposed as filters instead, since sorting
 * by them only yields arbitrary alphabetical groupings.
 */
export enum JobResearchSortField {
  displayId = 'displayId',
  researchedAt = 'researchedAt',
  postedDate = 'postedDate',
  lastContactedAt = 'lastContactedAt',
  createdAt = 'createdAt',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

/** Normalizes a querystring value into an array — Express/Nest won't auto-array a lone `?key=x`. */
const toArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : value === undefined ? value : [value];

export class QueryJobResearchDto {
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
    description: 'Column to sort by. Defaults to most recently researched.',
    enum: JobResearchSortField,
  })
  @IsOptional()
  @IsEnum(JobResearchSortField)
  sortBy?: JobResearchSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({
    description: 'Free-text search across jobTitle, displayId, notes and contactEmailFromAd',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by client ID (exact match)' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filter by multiple client IDs at once', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  clientIds?: string[];

  @ApiPropertyOptional({
    description:
      'Filter by the consultant who conducted the research. Ignored for the consultant role, which is scoped to its own patch instead.',
    type: [String],
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  consultantIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by JobTitle id(s)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  jobTitleIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by JobRoleType id(s)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  jobRoleTypeIds?: string[];

  @ApiPropertyOptional({
    description:
      'Filter by Location id(s). A node matches itself plus everything beneath it, so selecting a state returns every ad in its cities.',
    type: [String],
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by location name (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Filter by the client-status snapshot taken when the ad was logged (one or more)',
    enum: ClientStatus,
    isArray: true,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(ClientStatus, { each: true })
  statuses?: ClientStatus[];

  @ApiPropertyOptional({ description: 'Filter by whether the advertiser has been approached yet' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isContacted?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by whether the research has since been converted into a Job Order — the research funnel’s conversion column',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  hasJobOrder?: boolean;
}
