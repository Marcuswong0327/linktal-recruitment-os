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
 *
 * `lastContact*` fields aren't part of the raw `Candidate` model — they're
 * resolved from the most recent `CandidateContactHistory` row (see
 * CandidatesService), added here so exports get readable columns without the
 * caller joining contact history + consultants themselves. `lastContactedAt`
 * is the exception: it's a real denormalized column (needed for sorting), the
 * other three are resolved live from that latest row since they're
 * display-only.
 *
 * `industry`/`roleType`/`specializations` aren't part of the raw `Candidate`
 * model either (only `industryId`/`roleTypeId` are, and specializations is a
 * many-to-many relation with no scalar column at all) — same reasoning as
 * StakeholderEntity.roleType: the resolved name(s) are added here so callers
 * get plain strings instead of joining against /industries,
 * /candidate-role-types or /specializations themselves.
 */
export class CandidateEntity implements Omit<Candidate, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CDD-0001' }) displayId!: string;
  @ApiProperty({ example: 'John Smith' }) fullName!: string;
  @ApiProperty({ type: String, nullable: true }) givenName!: string | null;
  @ApiProperty({ type: String, nullable: true }) familyName!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) industryId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved industry name' })
  industry!: string | null;
  @ApiProperty({ type: String, nullable: true }) roleTypeId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved role type name' })
  roleType!: string | null;
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
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    nullable: true,
    description: 'Free-entry skill tags',
  })
  skills!: Prisma.JsonValue;
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Resolved specialization names',
  })
  specializations!: string[];
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Specialization IDs backing `specializations` — what an editable multi-select actually binds to',
  })
  specializationIds!: string[];
  @ApiProperty({ enum: CandidateStatus }) status!: CandidateStatus;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    nullable: true,
    description: '[{ content, timestamp, by }]',
  })
  notes!: Prisma.JsonValue;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: "Latest contactedAt across this candidate's contact history; null if never contacted",
  })
  lastContactedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Contact method of the most recent contact (email, call, meeting, linkedin)' })
  lastContactType!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Notes from the most recent contact' })
  lastContactNotes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved name of the consultant who made the most recent contact' })
  lastContactedBy!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
