import { ApiProperty } from '@nestjs/swagger';
import { ClientJobResearch, ClientStatus } from '@prisma/client';

/**
 * OpenAPI response shape for a row of market research.
 *
 * `implements ClientJobResearch` ties this class to the Prisma model at compile
 * time, keeping the generated frontend types honest to the database (the source
 * of truth). Nullable columns use `@ApiProperty({ nullable: true })` with an
 * explicit `type`, because Prisma always returns the column, just as `null`.
 *
 * `companyName`, `consultant`, `jobTitle`, `jobRoleType` and `location` aren't
 * part of the raw model (only the FK ids are) — they're the FKs' resolved names,
 * added so the research list renders without joining against five other
 * endpoints first. The parallel `*Id` fields are what an editable form binds to.
 *
 * `jobOrderId` is the conversion link, read from the optional back-reference: a
 * JobOrder may cite the research row it originated from, and null means this ad
 * hasn't become a brief.
 */
export class JobResearchEntity implements Omit<ClientJobResearch, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'JR-000001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved client company name' })
  companyName!: string | null;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved name of the consultant who researched this' })
  consultant!: string | null;
  @ApiProperty({ type: String, nullable: true }) locationId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved Location node name' })
  location!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Rung of the location node (COUNTRY/STATE/CITY/SUBURB)',
  })
  locationLevel!: string | null;
  @ApiProperty({ type: String, nullable: true }) jobTitleId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved job title — the advertiser’s own words' })
  jobTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) jobRoleTypeId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Resolved role type — the consultant’s classification of the ad',
  })
  jobRoleType!: string | null;
  @ApiProperty({
    enum: ClientStatus,
    nullable: true,
    description: 'Snapshot of the client’s status when logged — not a live reference to Client.status',
  })
  status!: ClientStatus | null;
  @ApiProperty({ type: String, nullable: true }) seekUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) permanentUrl!: string | null;
  @ApiProperty({ type: Date, nullable: true, description: 'When the ad was posted' })
  postedDate!: Date | null;
  @ApiProperty({ type: String, nullable: true }) contactEmailFromAd!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Salary as written in the ad. Free text, copied verbatim.',
  })
  salaryRange!: string | null;
  @ApiProperty({ description: 'Whether the advertiser has been approached about this ad' })
  isContacted!: boolean;
  @ApiProperty({ description: 'When the research was logged (distinct from postedDate)' })
  researchedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) lastContactedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) lastContactedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Job Order this research was converted into; null if it has not become a brief',
  })
  jobOrderId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
