import { ApiProperty } from '@nestjs/swagger';
import { AuditLogEntity } from './audit-log.entity';

export class PaginatedAuditLogsEntity {
  @ApiProperty({ type: AuditLogEntity, isArray: true })
  data!: AuditLogEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 128 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 7 })
  pageCount!: number;
}
