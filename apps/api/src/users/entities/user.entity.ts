import { ApiProperty } from '@nestjs/swagger';

/**
 * OpenAPI response shape for a "user" — this is the Consultant table viewed
 * as an admin-management resource (role assignment + active/inactive),
 * hence the name mismatch with the underlying Prisma model.
 */
export class UserEntity {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'consultant-0001' }) displayId!: string;
  @ApiProperty({ example: 'John Smith' }) fullName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Null if no role is assigned yet' })
  roleName!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Count of this consultant\'s ACTIVE job orders' })
  openJobOrders!: number;
  @ApiProperty() createdAt!: Date;
}
