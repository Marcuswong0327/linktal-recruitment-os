import { ApiProperty } from '@nestjs/swagger';
import { StakeholderContactHistory } from '@prisma/client';

/** OpenAPI response shape for a StakeholderContactHistory row (one logged contact). */
export class StakeholderContactHistoryEntity implements StakeholderContactHistory {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CN-000001' }) displayId!: string;
  @ApiProperty() stakeholderId!: string;
  @ApiProperty({ type: String, nullable: true, example: 'call', description: 'Channel: email, call, meeting, linkedin' })
  contactType!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Detailed Brief Notes',
    description: 'Kind of note — distinct from contactType, which is the channel.',
  })
  category!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made this contact' })
  contactedById!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() contactedAt!: Date;
  @ApiProperty() createdAt!: Date;
}
