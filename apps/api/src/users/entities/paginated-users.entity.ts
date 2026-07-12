import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from './user.entity';

export class PaginatedUsersEntity {
  @ApiProperty({ type: UserEntity, isArray: true })
  data!: UserEntity[];

  @ApiProperty({ description: 'Total rows matching the filters', example: 17 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  pageSize!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  pageCount!: number;
}
