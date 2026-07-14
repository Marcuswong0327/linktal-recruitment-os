import { ApiProperty } from '@nestjs/swagger';
import { Client, ClientStatus } from '@prisma/client';

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
 */
export class ClientEntity implements Omit<Client, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Client-0001' }) displayId!: string;
  @ApiProperty({ example: 'Acme Corp' }) companyName!: string;
  @ApiProperty({ type: String, nullable: true }) industry!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
  @ApiProperty({ example: false }) tobSigned!: boolean;
  @ApiProperty({ type: Number, nullable: true, example: 15 }) feePercentage!: number | null;
  @ApiProperty({ example: 90 }) guaranteePeriod!: number;
  @ApiProperty({ enum: ClientStatus }) status!: ClientStatus;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
