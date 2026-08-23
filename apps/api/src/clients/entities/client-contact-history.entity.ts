import { ApiProperty } from '@nestjs/swagger';
import { StakeholderContactHistory } from '@prisma/client';

/**
 * A client has no contact history of its own — this is a StakeholderContactHistory
 * row (client-side notes live on the stakeholder that was actually contacted),
 * aggregated across every non-deleted stakeholder at this client and flattened
 * with `stakeholderName` so the client's own "Contact history" view can show
 * who each contact was actually with, not just "someone at this company."
 */
export class ClientContactHistoryEntity implements StakeholderContactHistory {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CN-000001' }) displayId!: string;
  @ApiProperty() stakeholderId!: string;
  @ApiProperty({ description: 'Which stakeholder this contact was with' })
  stakeholderName!: string;
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
