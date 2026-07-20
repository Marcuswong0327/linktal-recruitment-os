import { ApiProperty } from '@nestjs/swagger';
import { CandidateSavedSearch } from '@prisma/client';

/** OpenAPI response shape for a CandidateSavedSearch. */
export class CandidateSavedSearchEntity implements CandidateSavedSearch {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() consultantId!: string;
  @ApiProperty({ type: Object }) filters!: CandidateSavedSearch['filters'];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
