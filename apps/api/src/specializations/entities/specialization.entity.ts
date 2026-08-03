import { ApiProperty } from '@nestjs/swagger';
import { Specialization } from '@prisma/client';

/** OpenAPI response shape for a Specialization. */
export class SpecializationEntity implements Specialization {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Food - Bakery' }) name!: string;
  @ApiProperty({ description: 'Specializations belong to exactly one Industry.' })
  industryId!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Parent category, e.g. "Food" for "Food - Bakery". Null for a top-level category.',
  })
  parentId!: string | null;
  @ApiProperty({
    type: [String],
    description:
      'This specialization plus every ancestor. A consultant grant on any of these ids covers this row — see common/scope.ts.',
  })
  ancestorIds!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
