import { ApiProperty } from '@nestjs/swagger';
import { JobOrderEntity } from './job-order.entity';

/** Envelope for the paginated job orders list (offset/limit pagination). */
export class PaginatedJobOrdersEntity {
  @ApiProperty({ type: JobOrderEntity, isArray: true })
  data!: JobOrderEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 342 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 18 })
  pageCount!: number;
}
