import { ApiProperty } from '@nestjs/swagger';
import { Industry } from '@prisma/client';

/** OpenAPI response shape for an Industry. */
export class IndustryEntity implements Industry {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Manufacturing' }) name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
