import { ApiProperty } from '@nestjs/swagger';
import { StakeholderRoleType } from '@prisma/client';

/** OpenAPI response shape for a StakeholderRoleType. */
export class StakeholderRoleTypeEntity implements StakeholderRoleType {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Hiring Manager' }) name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
