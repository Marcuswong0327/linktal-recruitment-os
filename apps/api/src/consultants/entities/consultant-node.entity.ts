import { ApiProperty } from '@nestjs/swagger';

/**
 * One node of the org chart (`GET /consultants/hierarchy`).
 *
 * Deliberately much thinner than `ConsultantEntity` — no salary, no cost, no
 * scope grants. The org chart is a navigation aid, so it carries only what a
 * tree renders with, and a manager browsing it doesn't incidentally get every
 * consultant's pay.
 *
 * **This structure confers no access.** Reporting lines are presentation only;
 * visibility is decided entirely by the scope resolver (see
 * `docs/rbac-roles.md` §3).
 */
export class ConsultantNodeEntity {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'consultant-0002' }) displayId!: string;
  @ApiProperty({ example: 'Daniel Kee' }) fullName!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Who this person reports to; null at the root of the chart',
  })
  reportsToId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved role name' })
  roleName!: string | null;
  @ApiProperty({ description: 'Whether the account is active' })
  isActive!: boolean;
  @ApiProperty({
    description: 'Distance from the requested root — 0 for the root itself. Lets a client indent without walking parents.',
    example: 1,
  })
  depth!: number;
}
