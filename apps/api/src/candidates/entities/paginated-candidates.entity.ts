import { ApiProperty } from '@nestjs/swagger';
import { CandidateEntity } from './candidate.entity';

/** Envelope for the paginated candidates list (offset/limit pagination). */
export class PaginatedCandidatesEntity {
  @ApiProperty({ type: CandidateEntity, isArray: true })
  data!: CandidateEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 342 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 18 })
  pageCount!: number;
}
