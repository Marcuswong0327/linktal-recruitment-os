import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

/** Actions the audit extension emits (see prisma.extensions.ts deriveAction). */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  SOFT_DELETE = 'SOFT_DELETE',
  RESTORE = 'RESTORE',
  DEACTIVATE = 'DEACTIVATE',
  HARD_DELETE = 'HARD_DELETE',
}

export enum AuditSortField {
  createdAt = 'createdAt',
  action = 'action',
  entityType = 'entityType',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class QueryAuditLogsDto {
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

  @ApiPropertyOptional({ description: 'Column to sort by. Defaults to createdAt.', enum: AuditSortField })
  @IsOptional()
  @IsEnum(AuditSortField)
  sortBy?: AuditSortField;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.desc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.desc;

  @ApiPropertyOptional({ description: 'Filter by action', enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'Filter by entity type, e.g. "Candidate"' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Filter by the acting consultant id' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Only entries at/after this ISO date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Only entries at/before this ISO date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
