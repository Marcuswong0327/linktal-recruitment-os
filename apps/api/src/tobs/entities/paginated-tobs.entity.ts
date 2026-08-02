import { ApiProperty } from '@nestjs/swagger';
import { TobEntity } from './tob.entity';

/** Envelope for the paginated TOBs list (offset/limit pagination). */
export class PaginatedTobsEntity {
  @ApiProperty({ type: TobEntity, isArray: true })
  data!: TobEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 87 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 5 })
  pageCount!: number;
}
