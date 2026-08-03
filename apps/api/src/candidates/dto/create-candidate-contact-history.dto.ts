import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { CandidateStatus } from '@prisma/client';
import { CONTACT_TYPES } from '../../common/contact-types';

/**
 * One logged contact with a candidate. Screening notes and outreach notes both
 * land here, told apart by `category` — which is why there's no single `notes`
 * field: the caller fills `conversationSummary` or `outreachCampaignNotes`
 * depending on which kind of contact this was.
 */
export class CreateCandidateContactHistoryDto {
  @ApiProperty({ description: 'How this contact happened', enum: CONTACT_TYPES, example: 'call' })
  @IsIn(CONTACT_TYPES)
  contactType!: string;

  @ApiPropertyOptional({
    description: 'Kind of note — distinct from contactType, which is the channel',
    example: 'Detailed Screening Notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: 'The screening call content' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  conversationSummary?: string;

  @ApiPropertyOptional({ description: 'Notes for an outreach campaign entry' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  outreachCampaignNotes?: string;

  @ApiPropertyOptional({
    description: "Snapshot of the candidate's status at the time of this contact; defaults to WARM",
    enum: CandidateStatus,
  })
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional({ description: 'Suburb captured during this contact', example: 'Silverwater' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  suburb?: string;

  @ApiPropertyOptional({
    description: 'Free text, not a number — the source records values like "35 per hour"',
    example: '35 per hour',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentSalary?: string;

  @ApiPropertyOptional({ description: 'Free text, same reasoning as currentSalary', example: '55-60' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  expectedSalary?: string;

  @ApiPropertyOptional({
    description: 'When this contact happened (ISO 8601); defaults to now if omitted — set explicitly to log a past contact',
    example: '2026-07-16T18:58:34.123Z',
  })
  @IsOptional()
  @IsISO8601()
  contactedAt?: string;
}
