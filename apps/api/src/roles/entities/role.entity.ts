import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

/** A permission granted to a role (flattened from the RolePermission join). */
export class PermissionSummaryEntity {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'candidate' }) resource!: string;
  @ApiProperty({ example: 'read' }) action!: string;
}

/**
 * OpenAPI response shape for a Role. `implements Role` ties the scalar fields to
 * the Prisma model; `permissions` is added (flattened from RolePermission) so
 * the granted permissions are visible without a second call.
 */
export class RoleEntity implements Role {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'consultant' }) name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: PermissionSummaryEntity, isArray: true })
  permissions!: PermissionSummaryEntity[];
  @ApiProperty({ description: 'How many consultants currently hold this role', example: 3 })
  consultantCount!: number;
}
