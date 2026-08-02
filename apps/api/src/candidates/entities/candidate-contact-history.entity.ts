import { ApiProperty } from '@nestjs/swagger';
import { CandidateContactHistory, CandidateStatus } from '@prisma/client';

/**
 * OpenAPI response shape for a CandidateContactHistory row.
 *
 * Screening notes and outreach notes both live here, told apart by `category`
 * — which is why the old single `notes` field is gone in favour of
 * `conversationSummary` / `outreachCampaignNotes`.
 */
export class CandidateContactHistoryEntity implements CandidateContactHistory {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CDN-0001' }) displayId!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty({ type: String, nullable: true, example: 'call', description: 'Channel: email, call, meeting, linkedin' })
  contactType!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Detailed Screening Notes',
    description: 'Kind of note — distinct from contactType, which is the channel.',
  })
  category!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made this contact' })
  contactedById!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The screening call content.' })
  conversationSummary!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Filled for outreach campaign entries.' })
  outreachCampaignNotes!: string | null;
  @ApiProperty({ enum: CandidateStatus, description: "Snapshot of the candidate's status at the time of this contact." })
  status!: CandidateStatus;
  @ApiProperty({ type: String, nullable: true }) suburb!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Free text, not a number — the source records values like "35 per hour".',
  })
  currentSalary!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Free text, e.g. "55-60".' })
  expectedSalary!: string | null;
  @ApiProperty() contactedAt!: Date;
  @ApiProperty() createdAt!: Date;
}
