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
  @ApiProperty({ example: 'CST-000001' }) displayId!: string;
  @ApiProperty({ type: String, nullable: true }) azureId!: string | null;
  @ApiProperty({ example: 'jane@linktal.com' }) email!: string;
  @ApiProperty({ example: 'Jane Doe' }) fullName!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Seniority is carried as a JobTitle ("Consultant (Senior)"), not its own enum.',
  })
  jobTitleId!: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Monthly cost of this consultant.' })
  salary!: number | null;
  @ApiProperty({ type: String, nullable: true, description: "P&L bucket this consultant's cost rolls up to." })
  costTo!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "This consultant's manager — powers the org chart. Null at the top of the tree.",
  })
  reportsToId!: string | null;
  @ApiProperty({ type: String, nullable: true }) roleId!: string | null;
  @ApiProperty({ example: true }) isActive!: boolean;
  @ApiProperty({
    example: false,
    description:
      'True only for a brand-new email+password signup awaiting its first admin decision. Cleared the first time an admin sets isActive (either direction) — see the Prisma model doc comment.',
  })
  pendingApproval!: boolean;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Stamped on a completed sign-in only (not token refresh). General "last signed in" telemetry.',
  })
  lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: RoleSummaryEntity, nullable: true })
  role?: RoleSummaryEntity | null;
  /**
   * The three arms of this consultant's visibility scope. Each is present only
   * when the caller holds the matching `consultant_*:read`, or the consultant
   * is looking at their own record — omitted entirely otherwise, not just
   * emptied, since an empty list would read as "no grants", a materially
   * different statement than "you can't see this". The three permissions are
   * independent, so a caller can hold one arm and not another.
   *
   * Names and ids come as parallel arrays, same pairing as Candidate's
   * `specializations`/`specializationIds`: the names are display-only, the ids
   * are what an editable multi-select binds to.
   */
  @ApiPropertyOptional({ type: [String] })
  industries?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Industry IDs backing `industries`' })
  industryIds?: string[];
  @ApiPropertyOptional({
    type: [String],
    description: 'Assigned specializations, narrowing the industry arm. A grant covers the node plus every child.',
  })
  specializations?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Specialization IDs backing `specializations`' })
  specializationIds?: string[];
  @ApiPropertyOptional({
    type: [String],
    description: "Assigned locations — this consultant's patch, at any level. A grant covers the node plus every descendant.",
  })
  locations?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Location IDs backing `locations`' })
  locationIds?: string[];
}
