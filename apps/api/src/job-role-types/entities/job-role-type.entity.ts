import { ApiProperty } from '@nestjs/swagger';
import { JobRoleType } from '@prisma/client';

/** OpenAPI response shape for a JobRoleType — the consultant's own classification of a *job* (Electrician, Fitter Lead, CNC Machinist). Kept separate from StakeholderRoleType because the two vocabularies never overlap. */
export class JobRoleTypeEntity implements JobRoleType {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CNC Machinist' }) name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
