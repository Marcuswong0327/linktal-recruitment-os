import { ApiProperty } from '@nestjs/swagger';
import { Specialization } from '@prisma/client';

/** OpenAPI response shape for a Specialization. */
export class SpecializationEntity implements Specialization {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Blockchain Services' }) name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
