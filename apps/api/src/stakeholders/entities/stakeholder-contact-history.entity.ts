import { ApiProperty } from '@nestjs/swagger';
import { StakeholderContactHistory } from '@prisma/client';

/** OpenAPI response shape for a StakeholderContactHistory row (one logged contact). */
export class StakeholderContactHistoryEntity implements StakeholderContactHistory {
  @ApiProperty() id!: string;
  @ApiProperty() stakeholderId!: string;
  @ApiProperty({ example: 'call' }) contactType!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made this contact' })
  contactedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() contactedAt!: Date;
  @ApiProperty() createdAt!: Date;
}
