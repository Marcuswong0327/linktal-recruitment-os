import { ApiProperty } from '@nestjs/swagger';
import { JobResearchEntity } from './job-research.entity';

/** Envelope for the paginated job-research list (offset/limit pagination). */
export class PaginatedJobResearchEntity {
  @ApiProperty({ type: JobResearchEntity, isArray: true })
  data!: JobResearchEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 1240 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 62 })
  pageCount!: number;
}
