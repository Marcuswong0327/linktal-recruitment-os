import { ApiProperty } from '@nestjs/swagger';
import { StakeholderRoleType } from '@prisma/client';

/** OpenAPI response shape for a StakeholderRoleType — the consultant's classification of a *contact* by the function they sit in at the client (HR, Finance, Safety, Procurement). See JobRoleType for why these are two catalogs and not one. */
export class StakeholderRoleTypeEntity implements StakeholderRoleType {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Procurement' }) name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
