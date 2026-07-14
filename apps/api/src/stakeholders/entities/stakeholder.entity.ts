import { ApiProperty } from '@nestjs/swagger';
import { Stakeholder } from '@prisma/client';

/**
 * OpenAPI response shape for a Stakeholder.
 *
 * `implements Stakeholder` ties this class to the Prisma model at compile time,
 * keeping the generated frontend types honest to the database (the source of
 * truth). Nullable columns use `@ApiProperty({ nullable: true })` with an
 * explicit `type`, because Prisma always returns the column, just as `null`.
 */
export class StakeholderEntity implements Omit<Stakeholder, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Stake-0001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ example: 'Jane Doe' }) fullName!: string;
  @ApiProperty({ type: String, nullable: true }) jobTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({ example: false }) isDecisionMaker!: boolean;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
