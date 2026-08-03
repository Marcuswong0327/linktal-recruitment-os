import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Columns the list may be sorted by. Deliberately narrow: ID, file name,
 * creation time, and guaranteePeriod (the one commercial term stored as a
 * number — `pricing` is free text and sorts meaninglessly). The rest are
 * exposed as filters instead.
 */
export enum TobSortField {
  displayId = 'displayId',
  fileName = 'fileName',
  createdAt = 'createdAt',
  guaranteePeriod = 'guaranteePeriod',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class QueryTobsDto {
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
    enum: TobSortField,
  })
  @IsOptional()
  @IsEnum(TobSortField)
  sortBy?: TobSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({
    description:
      'Free-text search across displayId, fileName, clientTobRepresentative, invoiceContactName and invoiceContactEmail',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by client ID (exact match) — the client detail page’s TOB tab' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filter by multiple client IDs at once', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  clientIds?: string[];

  @ApiPropertyOptional({ description: 'Filter by the Linktal consultant who signed' })
  @IsOptional()
  @IsString()
  linktalRepresentativeId?: string;
}
