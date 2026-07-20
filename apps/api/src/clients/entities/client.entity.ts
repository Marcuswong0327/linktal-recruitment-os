import { ApiProperty } from '@nestjs/swagger';
import { Client, ClientQuality, ClientStatus } from '@prisma/client';
import { ClientNoteDto } from '../dto/client-note.dto';

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
 * `notes` is excluded from the `Omit` below and typed as `ClientNoteDto[]`
 * ourselves — Prisma's `Json` maps to `JsonValue`, which has no room for a
 * concrete shape (`JsonObject` requires a string index signature a real class
 * doesn't have), so checking it structurally against `Client` would just
 * force `notes` back down to untyped JSON.
 *
 * `industry`/`specialization` aren't part of the raw `Client` model (only
 * `industryId`/`specializationId` are) — they're the FK's resolved name,
 * added here so callers keep getting a plain string instead of having to
 * join against `/industries`/`/specializations` themselves just to display
 * what's already set.
 */
export class ClientEntity implements Omit<Client, 'deletedAt' | 'deletedById' | 'notes'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Client-0001' }) displayId!: string;
  @ApiProperty({ example: 'Acme Corp' }) companyName!: string;
  @ApiProperty({ type: String, nullable: true }) industryId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved industry name' })
  industry!: string | null;
  @ApiProperty({ type: String, nullable: true }) specializationId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved specialization name' })
  specialization!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
  @ApiProperty({ example: false }) tobSigned!: boolean;
  @ApiProperty({ type: Number, nullable: true, example: 15 }) feePercentage!: number | null;
  @ApiProperty({ example: 90 }) guaranteePeriod!: number;
  @ApiProperty({ enum: ClientStatus }) status!: ClientStatus;
  @ApiProperty({ enum: ClientQuality }) quality!: ClientQuality;
  @ApiProperty({ type: [ClientNoteDto], nullable: true }) notes!: ClientNoteDto[] | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Latest contactedAt across this client\'s stakeholders; null if never contacted',
  })
  lastContactedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Contact method of the most recent contact, across all stakeholders (email, call, meeting, linkedin)' })
  lastContactType!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Notes from the most recent contact, across all stakeholders' })
  lastContactNotes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved name of the consultant who made the most recent contact, across all stakeholders' })
  lastContactedBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
