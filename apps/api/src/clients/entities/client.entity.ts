import { ApiProperty } from '@nestjs/swagger';
import { Client, ClientStatus } from '@prisma/client';
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
 */
export class ClientEntity implements Omit<Client, 'deletedAt' | 'deletedById' | 'notes'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Client-0001' }) displayId!: string;
  @ApiProperty({ example: 'Acme Corp' }) companyName!: string;
  @ApiProperty({ type: String, nullable: true }) industry!: string | null;
  @ApiProperty({ type: String, nullable: true }) specialization!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
  @ApiProperty({ example: false }) tobSigned!: boolean;
  @ApiProperty({ type: Number, nullable: true, example: 15 }) feePercentage!: number | null;
  @ApiProperty({ example: 90 }) guaranteePeriod!: number;
  @ApiProperty({ enum: ClientStatus }) status!: ClientStatus;
  @ApiProperty({ type: [ClientNoteDto], nullable: true }) notes!: ClientNoteDto[] | null;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
