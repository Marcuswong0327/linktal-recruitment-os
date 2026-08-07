import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toArray = ({ value }: { value: unknown }) => (Array.isArray(value) ? value : value === undefined ? value : [value]);

/**
 * Columns the list may be sorted by. Deliberately narrow: ID, name, email, and
 * creation time. Categorical columns (role, isActive) are exposed as filters
 * instead, since sorting by them only yields arbitrary groupings.
 */
export enum ConsultantSortField {
  displayId = 'displayId',
  fullName = 'fullName',
  email = 'email',
  createdAt = 'createdAt',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class QueryConsultantsDto {
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
    enum: ConsultantSortField,
  })
  @IsOptional()
  @IsEnum(ConsultantSortField)
  sortBy?: ConsultantSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({ description: 'Free-text search across fullName, email and displayId' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by role ID (exact match)' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Filter by role name (exact, case-insensitive)', example: 'manager' })
  @IsOptional()
  @IsString()
  roleName?: string;

  @ApiPropertyOptional({ description: 'Filter by active flag' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by assigned industry id(s) (one or more, exact match)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  industryIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by assigned specialization id(s) (one or more, exact match)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  specializationIds?: string[];

  @ApiPropertyOptional({
    description:
      "Filter by assigned Location id(s). Selecting a country or state matches every consultant whose patch sits beneath it, via the ancestor path.",
    type: [String],
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];
}
