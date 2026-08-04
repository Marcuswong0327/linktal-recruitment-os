import { ApiProperty } from '@nestjs/swagger';
import { Stakeholder } from '@prisma/client';

/**
 * OpenAPI response shape for a Stakeholder.
 *
 * `implements Stakeholder` ties this class to the Prisma model at compile time,
 * keeping the generated frontend types honest to the database (the source of
 * truth). Nullable columns use `@ApiProperty({ nullable: true })` with an
 * explicit `type`, because Prisma always returns the column, just as `null`.
 *
 * `companyName`, `jobTitle`, `roleType` and `coverage` aren't part of the raw
 * `Stakeholder` model (only the FK ids are, and coverage is a many-to-many
 * relation with no scalar column at all) — they're the FKs' resolved names,
 * added here so callers (esp. the cross-company enrichment workspace) get
 * plain strings instead of having to join against /job-titles,
 * /stakeholder-role-types, /locations or /clients themselves just to display
 * what's already set. The parallel `*Id`/`*Ids` fields are what an editable
 * form actually binds to.
 *
 * `lastContactedAt`/`lastContactedById` are real denormalized columns (needed
 * for sorting); the other `lastContact*` fields are resolved live from the
 * most recent StakeholderContactHistory row, since they're display-only.
 */
export class StakeholderEntity implements Omit<Stakeholder, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Stake-0001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved client company name' })
  companyName!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Jane' }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Doe' }) lastName!: string | null;
  @ApiProperty({ type: String, nullable: true }) jobTitleId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Resolved job title — the company's own words for the role",
  })
  jobTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) stakeholderRoleTypeId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Resolved role type name — the consultant's classification of the role",
  })
  roleType!: string | null;
  @ApiProperty({ type: String, nullable: true }) linkedinUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: "Resolved names of the Location nodes this stakeholder covers — their own territory, independent of where the client sits",
  })
  coverage!: string[];
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Location IDs backing `coverage` — what an editable multi-select actually binds to',
  })
  coverageLocationIds!: string[];
  @ApiProperty({
    type: Date,
    nullable: true,
    description: "Latest contactedAt across this stakeholder's own contact history; null if never contacted",
  })
  lastContactedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made the most recent contact' })
  lastContactedById!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Contact method of the most recent contact (email, call, meeting, linkedin)' })
  lastContactType!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Category of the most recent contact — distinct from lastContactType, which is the channel',
  })
  lastContactCategory!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Notes from the most recent contact' })
  lastContactNotes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved name of the consultant who made the most recent contact' })
  lastContactedBy!: string | null;
  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: "Whether these details have been verified — null means 'not yet checked', which isn't the same as false",
  })
  isAccurate!: boolean | null;
  @ApiProperty({ type: String, nullable: true, description: 'What is wrong with the details, when isAccurate is false' })
  inaccurateReason!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
