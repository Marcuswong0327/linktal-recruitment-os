import { ApiProperty } from '@nestjs/swagger';
import { Candidate, CandidateStatus, Prisma } from '@prisma/client';

/**
 * OpenAPI response shape for a Candidate.
 *
 * `implements Candidate` ties this class to the Prisma model at compile time —
 * if the schema changes, this entity fails to compile until updated, keeping
 * the generated frontend types honest to the database (the source of truth).
 *
 * Nullable columns use `@ApiProperty({ nullable: true })` (required key +
 * nullable value) — not `@ApiPropertyOptional` — because Prisma always returns
 * the column, just as `null` when empty. An explicit `type` is required: a
 * `T | null` union reflects as `Object` at runtime, which would otherwise emit
 * `type: object` instead of the real scalar type.
 */
export class CandidateEntity implements Candidate {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CDD-0001' }) displayId!: string;
  @ApiProperty({ example: 'John Smith' }) fullName!: string;
  @ApiProperty({ type: String, nullable: true }) givenName!: string | null;
  @ApiProperty({ type: String, nullable: true }) familyName!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) industry!: string | null;
  @ApiProperty({ type: String, nullable: true }) roleType!: string | null;
  @ApiProperty({ type: String, nullable: true }) currentPosition!: string | null;
  @ApiProperty({ type: String, nullable: true }) currentCompany!: string | null;
  @ApiProperty({ type: Number, nullable: true }) yearsExperience!: number | null;
  @ApiProperty({ type: String, nullable: true }) salaryExpectation!: string | null;
  @ApiProperty({ type: String, nullable: true }) linkedinUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) resumeUrl!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    nullable: true,
    description: '[{ company, role, startDate, endDate }]',
  })
  workHistory!: Prisma.JsonValue;
  @ApiProperty({ type: 'array', items: { type: 'string' }, nullable: true })
  specializations!: Prisma.JsonValue;
  @ApiProperty({ enum: CandidateStatus }) status!: CandidateStatus;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
