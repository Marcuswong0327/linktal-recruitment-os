import { ApiProperty } from '@nestjs/swagger';
import { Client, ClientQuality, ClientStatus, Prisma } from '@prisma/client';

/**
 * OpenAPI response shape for a Client.
 *
 * `implements Client` ties this class to the Prisma model at compile time — if
 * the schema changes, this entity fails to compile until updated, keeping the
 * generated frontend types honest to the database (the source of truth).
 *
 * Nullable columns use `@ApiProperty({ nullable: true })` (required key +
 * nullable value) with an explicit `type`, because Prisma always returns the
 * column, just as `null` when empty.
 *
 * `industry`/`specialization`/`locations` aren't part of the raw `Client`
 * model (only the FK ids are, and locations is a many-to-many relation with no
 * scalar column at all) — they're the FKs' resolved names, added here so
 * callers keep getting plain strings instead of having to join against
 * /industries, /specializations or /locations themselves just to display
 * what's already set.
 *
 * There is no `notes` timeline here, deliberately: client-side notes live in
 * StakeholderContactHistory, which is where the `lastContact*` fields below
 * are resolved from. Candidates keep their own note timeline — the asymmetry
 * mirrors how the source data is actually recorded.
 */
export class ClientEntity implements Omit<Client, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Client-0001' }) displayId!: string;
  @ApiProperty({ example: 'Acme Corp' }) companyName!: string;
  @ApiProperty({ description: 'Required — the industry arm of the scope resolver relies on it' })
  industryId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved industry name' })
  industry!: string | null;
  @ApiProperty({ type: String, nullable: true }) specializationId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved specialization name' })
  specialization!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: "Resolved names of the Location nodes this client hires from — its market, not its office address",
  })
  locations!: string[];
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Location IDs backing `locations` — what an editable multi-select actually binds to',
  })
  locationIds!: string[];
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    nullable: true,
    description: "The client's own physical office address(es) — distinct from `locations`",
  })
  addresses!: Prisma.JsonValue;
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    nullable: true,
    description: "The client's own office suburb/postcode(s)",
  })
  suburbsAndPostcodes!: Prisma.JsonValue;
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
  @ApiProperty({ type: String, nullable: true }) seekJobMarketUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) linkedinJobMarketUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) generalDescription!: string | null;
  @ApiProperty({ enum: ClientStatus }) status!: ClientStatus;
  @ApiProperty({ enum: ClientQuality }) quality!: ClientQuality;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: "Latest contactedAt across this client's stakeholders; null if never contacted",
  })
  lastContactedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made the most recent contact' })
  lastContactedById!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Contact method of the most recent contact, across all stakeholders (email, call, meeting, linkedin)' })
  lastContactType!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Category of the most recent contact — distinct from lastContactType, which is the channel',
  })
  lastContactCategory!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Notes from the most recent contact, across all stakeholders' })
  lastContactNotes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved name of the consultant who made the most recent contact, across all stakeholders' })
  lastContactedBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
