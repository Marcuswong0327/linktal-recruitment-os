import { ApiProperty } from '@nestjs/swagger';
import { ConsultantEntity } from './consultant.entity';

/** Envelope for the paginated consultants list (offset/limit pagination). */
export class PaginatedConsultantsEntity {
  @ApiProperty({ type: ConsultantEntity, isArray: true })
  data!: ConsultantEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 16 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  pageCount!: number;
}
