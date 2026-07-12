import { ApiProperty } from '@nestjs/swagger';
import { StakeholderEntity } from './stakeholder.entity';

/** Envelope for the paginated stakeholders list (offset/limit pagination). */
export class PaginatedStakeholdersEntity {
  @ApiProperty({ type: StakeholderEntity, isArray: true })
  data!: StakeholderEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 342 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 18 })
  pageCount!: number;
}
