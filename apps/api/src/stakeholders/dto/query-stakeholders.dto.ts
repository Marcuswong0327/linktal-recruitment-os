import { ApiPropertyOptional } from '@nestjs/swagger';
import { StakeholderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Columns the list may be sorted by. Includes ID, name parts, creation time,
 * lastContactedAt (denormalized — see Stakeholder.lastContactedAt), plus the
 * table columns Name/Company/Role type/Job title (`fullName`, `companyName`,
 * `roleType`, `jobTitle`) which order via relations or firstName+lastName.
 * Coverage / contact methods / status stay filter-only.
 */
export enum StakeholderSortField {
  displayId = 'displayId',
  firstName = 'firstName',
  lastName = 'lastName',
  fullName = 'fullName',
  companyName = 'companyName',
  roleType = 'roleType',
  jobTitle = 'jobTitle',
  createdAt = 'createdAt',
  lastContactedAt = 'lastContactedAt',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

/**
 * String tokens for Stakeholder.isAccurate's three states — mirrors the
 * frontend's own `accuracyValue`/`parseAccuracyValue` convention (columns.tsx),
 * since `true`/`false` aren't valid TS enum member names.
 */
export enum AccuracyFilter {
  Accurate = 'true',
  Inaccurate = 'false',
  Unchecked = 'unchecked',
}

export class QueryStakeholdersDto {
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
    enum: StakeholderSortField,
  })
  @IsOptional()
  @IsEnum(StakeholderSortField)
  sortBy?: StakeholderSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({
    description: 'Free-text search across firstName, lastName, email, displayId and mobile',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by client ID (exact match)' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by multiple client IDs at once (e.g. the stakeholder enrichment workspace, scoped to a set of selected companies)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  clientIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by job title (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({
    description: 'Filter by role type ID(s) (see /stakeholder-role-types)',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  roleTypeIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by JobTitle id(s)', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  jobTitleIds?: string[];

  @ApiPropertyOptional({
    description:
      "Filter by Location id(s) matched against a stakeholder's own coverage (not its client's location). Selecting a country or state matches every stakeholder whose coverage sits beneath it, via the ancestor path — same semantics as Client.locationIds.",
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @ApiPropertyOptional({
    description:
      "Filter by verification state (one or more): 'true' (Accurate), 'false' (Inaccurate), 'unchecked' (not yet verified). Omit for all.",
    enum: AccuracyFilter,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsEnum(AccuracyFilter, { each: true })
  accuracy?: AccuracyFilter[];

  @ApiPropertyOptional({
    description: 'Filter by relationship-warmth status (one or more). Omit for all.',
    enum: StakeholderStatus,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsEnum(StakeholderStatus, { each: true })
  statuses?: StakeholderStatus[];
}
