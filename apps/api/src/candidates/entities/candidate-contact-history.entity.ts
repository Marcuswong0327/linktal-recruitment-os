import { ApiProperty } from '@nestjs/swagger';
import { CandidateContactHistory, CandidateStatus, ContactCategory, OutreachChannel } from '@prisma/client';

/**
 * OpenAPI response shape for a CandidateContactHistory row.
 *
 * Screening notes and outreach notes both live here, told apart by `category`
 * — which is why the old single `notes` field is gone in favour of
 * `screeningNotes` / `outreachCampaignNotes` + `outreachChannel`. Only
 * `screeningNotes` (on a SCREENING row) is ever editable after creation —
 * every other field is an immutable factual record, tracked via
 * `editedAt`/`editedById`.
 */
export class CandidateContactHistoryEntity implements CandidateContactHistory {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CDN-000001' }) displayId!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty({ type: String, nullable: true, example: 'call', description: 'Channel: email, call, meeting, linkedin' })
  contactType!: string | null;
  @ApiProperty({ enum: ContactCategory, description: 'Kind of note — distinct from contactType, which is the channel.' })
  category!: ContactCategory;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made this contact' })
  contactedById!: string | null;
  @ApiProperty({
    enum: OutreachChannel,
    nullable: true,
    description: 'Which channel this outreach used — set only when category is OUTREACH.',
  })
  outreachChannel!: OutreachChannel | null;
  @ApiProperty({ type: String, nullable: true, description: 'Free-text campaign context — filled for OUTREACH entries.' })
  outreachCampaignNotes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'The screening call content — filled for SCREENING entries.' })
  screeningNotes!: string | null;
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
  @ApiProperty({ type: String, nullable: true, description: 'Set only when screeningNotes has been edited after creation.' })
  editedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: "Who made the last edit — may differ from contactedById." })
  editedById!: string | null;
}
