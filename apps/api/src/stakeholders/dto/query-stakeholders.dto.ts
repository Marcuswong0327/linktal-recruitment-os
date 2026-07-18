import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Columns the list may be sorted by. Deliberately narrow: ID, name, creation
 * time, and lastContactedAt (a denormalized column — see
 * Stakeholder.lastContactedAt in schema.prisma; Prisma's relation-aggregate
 * `orderBy` only supports `_count`, not `_max`, on to-many relations, so a
 * live join can't sort by "latest contact" directly). Categorical /
 * free-text columns (jobTitle, email, isDecisionMaker) are exposed as
 * filters instead, since sorting by them only yields arbitrary alphabetical
 * groupings.
 */
export enum StakeholderSortField {
  displayId = 'displayId',
  fullName = 'fullName',
  createdAt = 'createdAt',
  lastContactedAt = 'lastContactedAt',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
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
    description: 'Free-text search across fullName, email, displayId and mobile',
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

  @ApiPropertyOptional({ description: 'Filter by decision-maker flag' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isDecisionMaker?: boolean;
}
