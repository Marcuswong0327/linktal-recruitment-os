import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CandidateStatus, PlacementStatus, SubmissionStatus } from '@prisma/client';

/**
 * Columns the list may be sorted by. Deliberately narrow: IDs, names, numeric
 * fields, and lastContactedAt (a denormalized column — see
 * Candidate.lastContactedAt in schema.prisma). Categorical / free-text
 * columns (industry, roleType, country, city, currentCompany,
 * currentPosition, email) are exposed as filters instead, since sorting by
 * them only yields arbitrary alphabetical groupings. `status` is included
 * despite being categorical — its values have a meaningful temperature order
 * (Cold < Warm < Hot < Placed), unlike the other enums here.
 */
export enum CandidateSortField {
  displayId = 'displayId',
  fullName = 'fullName',
  familyName = 'familyName',
  givenName = 'givenName',
  yearsExperience = 'yearsExperience',
  lastContactedAt = 'lastContactedAt',
  status = 'status',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

/** Normalizes a querystring value into a string array — Express/Nest won't auto-array a lone `?key=x`. */
const toArray = ({ value }: { value: unknown }) => (Array.isArray(value) ? value : value === undefined ? value : [value]);

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
    description:
      'Free-text search across fullName, email, displayId, mobile, city, country, currentPosition, currentCompany, and industry/role type name',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by status (one or more). Omit for all statuses.', enum: CandidateStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(CandidateStatus, { each: true })
  statuses?: CandidateStatus[];

  @ApiPropertyOptional({ description: 'Filter by industry ID(s) (see /industries)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  industryIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by role type ID(s) (see /candidate-role-types)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  roleTypeIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by specialization ID(s) (see /specializations)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  specializationIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by skill tag(s) (exact match against the free-entry skills list)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Filter by owning consultant ID(s)', type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  consultantIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by submission status (has at least one submission with this status)', enum: SubmissionStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(SubmissionStatus, { each: true })
  submissionStatuses?: SubmissionStatus[];

  @ApiPropertyOptional({ description: 'Filter by placement status (has at least one placement with this status)', enum: PlacementStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(PlacementStatus, { each: true })
  placementStatuses?: PlacementStatus[];

  @ApiPropertyOptional({ description: 'Filter by location — matches city OR country (contains, case-insensitive)' })
  @IsOptional()
  @IsString()
  location?: string;

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

  @ApiPropertyOptional({ description: 'Only candidates last contacted on/after this date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  lastContactedFrom?: string;

  @ApiPropertyOptional({ description: 'Only candidates last contacted on/before this date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  lastContactedTo?: string;
}
