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
 * `roleType`/`companyName` aren't part of the raw `Stakeholder` model (only
 * `roleTypeId`/`clientId` are) — they're the FK's resolved name, added here
 * so callers (esp. the cross-company enrichment workspace) get a plain
 * string instead of having to join against `/stakeholder-role-types` or
 * `/clients` themselves just to display what's already set.
 */
export class StakeholderEntity implements Omit<Stakeholder, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Stake-0001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ type: String, nullable: true, description: "Resolved client company name" })
  companyName!: string | null;
  @ApiProperty({ example: 'Jane Doe' }) fullName!: string;
  @ApiProperty({ type: String, nullable: true }) jobTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) roleTypeId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved role type name' })
  roleType!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({ example: false }) isDecisionMaker!: boolean;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: "Latest contactedAt across this stakeholder's own contact history; null if never contacted",
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
