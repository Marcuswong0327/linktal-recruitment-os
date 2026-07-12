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
 * `implements Omit<Consultant, 'passwordHash'>` ties the scalar fields to the
 * Prisma model at compile time while keeping the bcrypt hash off the wire —
 * the service queries also `omit: { passwordHash: true }` so it's never
 * fetched for these responses in the first place. `role` is an added
 * convenience (the resolved role, not a scalar column) so admins/managers can
 * see each consultant's role in the list.
 */
export class ConsultantEntity implements Omit<Consultant, 'passwordHash'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'consultant-0001' }) displayId!: string;
  @ApiProperty({ type: String, nullable: true }) azureId!: string | null;
  @ApiProperty({ example: 'jane@linktal.com' }) email!: string;
  @ApiProperty({ example: 'Jane Doe' }) fullName!: string;
  @ApiProperty({ type: String, nullable: true }) roleId!: string | null;
  @ApiProperty({ example: true }) isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: RoleSummaryEntity, nullable: true })
  role?: RoleSummaryEntity | null;
}
