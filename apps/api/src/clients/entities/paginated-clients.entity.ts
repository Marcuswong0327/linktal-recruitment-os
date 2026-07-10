import { ApiProperty } from '@nestjs/swagger';
import { ClientEntity } from './client.entity';

/** Envelope for the paginated clients list (offset/limit pagination). */
export class PaginatedClientsEntity {
  @ApiProperty({ type: ClientEntity, isArray: true })
  data!: ClientEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 342 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 18 })
  pageCount!: number;
}
