import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum RoleSortField {
  name = 'name',
  createdAt = 'createdAt',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class QueryRolesDto {
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

  @ApiPropertyOptional({ description: 'Column to sort by. Defaults to name.', enum: RoleSortField })
  @IsOptional()
  @IsEnum(RoleSortField)
  sortBy?: RoleSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.asc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.asc;

  @ApiPropertyOptional({ description: 'Free-text search across the role name' })
  @IsOptional()
  @IsString()
  q?: string;
}
