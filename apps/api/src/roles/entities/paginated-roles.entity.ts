import { ApiProperty } from '@nestjs/swagger';
import { RoleEntity } from './role.entity';

/** Envelope for the paginated roles list (offset/limit pagination). */
export class PaginatedRolesEntity {
  @ApiProperty({ type: RoleEntity, isArray: true })
  data!: RoleEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 6 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  pageCount!: number;
}
