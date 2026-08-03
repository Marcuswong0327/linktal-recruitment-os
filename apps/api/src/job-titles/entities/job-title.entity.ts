import { ApiProperty } from '@nestjs/swagger';
import { JobTitle } from '@prisma/client';

/** OpenAPI response shape for a JobTitle — what the *company* calls a role. Deliberately distinct from JobRoleType, which is how a Linktal consultant classifies that same job. */
export class JobTitleEntity implements JobTitle {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Production Manager' }) name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
