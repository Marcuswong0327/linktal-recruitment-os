import { ApiProperty } from '@nestjs/swagger';
import { CandidateRoleType } from '@prisma/client';

/** OpenAPI response shape for a CandidateRoleType. */
export class CandidateRoleTypeEntity implements CandidateRoleType {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Permanent' }) name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
