import { ApiProperty } from '@nestjs/swagger';
import { Candidate, CandidateStatus, ContactCategory, LocationLevel, Prisma } from '@prisma/client';

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
 * CandidatesService). `lastContactedAt`/`lastContactedById` are the exception:
 * real denormalized columns (needed for sorting); the rest are resolved live
 * from that latest row since they're display-only.
 *
 * `industry`/`jobRoleType`/`location`/`specializations` aren't part of the raw
 * model either (only the FK ids are, and specializations is a many-to-many
 * relation with no scalar column at all) — same reasoning as
 * StakeholderEntity.roleType: the resolved name(s) are added here so callers
 * get plain strings instead of joining against /industries, /job-role-types,
 * /locations or /specializations themselves.
 */
// `mobileDigits` is omitted deliberately: it's the trigger-maintained
// digits-only mirror of `mobile` that free-text phone search matches against
// (see CandidatesService.buildWhere), an internal index, not information a
// caller has any use for — `mobile` is the value of record.
export class CandidateEntity implements Omit<Candidate, 'deletedAt' | 'deletedById' | 'mobileDigits'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CDD-000001' }) displayId!: string;
  @ApiProperty({ type: String, nullable: true, example: 'John' }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Smith' }) lastName!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({ description: 'Most specific known Location node — required, the scope resolver relies on it' })
  locationId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved location name' })
  location!: string | null;
  @ApiProperty({
    enum: LocationLevel,
    nullable: true,
    description: 'Which rung of the geography tree `location` sits on — a candidate known only to city level has no suburb',
  })
  locationLevel!: LocationLevel | null;
  @ApiProperty({ description: 'Required — the industry arm of the scope resolver relies on it' })
  industryId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved industry name' })
  industry!: string | null;
  @ApiProperty({ type: String, nullable: true }) jobRoleTypeId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Resolved role type name — the consultant's classification of what this person does",
  })
  jobRoleType!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Title at their current employer, in the employer's own words",
  })
  currentRole!: string | null;
  @ApiProperty({ type: String, nullable: true }) currentCompany!: string | null;
  @ApiProperty({ type: String, nullable: true }) linkedinUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) seekTalentUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The original, as-submitted resume' })
  rawResumeUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, description: "Linktal's own reformatted version of the resume" })
  editedResumeUrl!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    nullable: true,
    description: '[{ company, role, period }] — `period` is free text, the source never stores parseable dates',
  })
  workHistory!: Prisma.JsonValue;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    nullable: true,
    description: '[{ key, fileName }] — older/superseded resume or document versions',
  })
  historicFiles!: Prisma.JsonValue;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    nullable: true,
    description: '[{ key, fileName }] — other supporting documents attached to the candidate',
  })
  otherDocuments!: Prisma.JsonValue;
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
    type: Date,
    nullable: true,
    description: "Latest contactedAt across this candidate's contact history; null if never contacted",
  })
  lastContactedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made the most recent contact' })
  lastContactedById!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Contact method of the most recent contact (email, call, meeting, linkedin)' })
  lastContactType!: string | null;
  @ApiProperty({
    enum: ContactCategory,
    nullable: true,
    description: 'Category of the most recent contact — distinct from lastContactType, which is the channel',
  })
  lastContactCategory!: ContactCategory | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Notes from the most recent contact — its screening summary, or its outreach notes when that is what was logged',
  })
  lastContactNotes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved name of the consultant who made the most recent contact' })
  lastContactedBy!: string | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "Resolved live from the latest CandidateContactHistory row (see lastContactType/lastContactedBy) — distinct from lastContactedAt, which is a denormalized column left null on imported history. Sort/filter by lastContactedAt; display this.",
  })
  lastContactDate!: Date | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Free text, e.g. "35 per hour". A direct edit on the candidate wins if one has been made; otherwise this is the most recent CandidateContactHistory row\'s value. Null if never set either way. Display-only, no sort/filter.',
  })
  currentSalary!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Free text, e.g. "above 47". Same direct-edit-wins-over-latest-contact precedence as currentSalary.',
  })
  expectedSalary!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
