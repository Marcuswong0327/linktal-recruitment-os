import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Consultant } from '@prisma/client';

/** Minimal role info embedded in a consultant response. */
export class RoleSummaryEntity {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'consultant' }) name!: string;
}

/**
 * OpenAPI response shape for a Consultant.
 *
 * `implements Consultant` ties the scalar fields to the Prisma model at compile
 * time. `role` is an added convenience (the resolved role, not a scalar column)
 * so admins/managers can see each consultant's role in the list.
 */
export class ConsultantEntity implements Consultant {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'consultant-0001' }) displayId!: string;
  @ApiProperty({ type: String, nullable: true }) neonUserId!: string | null;
  @ApiProperty({ example: 'jane@linktal.com' }) email!: string;
  @ApiProperty({ example: 'Jane Doe' }) fullName!: string;
  @ApiProperty({ type: String, nullable: true }) roleId!: string | null;
  @ApiProperty({ example: true }) isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: RoleSummaryEntity, nullable: true })
  role?: RoleSummaryEntity | null;
}
