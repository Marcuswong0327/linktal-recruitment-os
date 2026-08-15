import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Edits a contact-history row's `screeningNotes` only — every other field
 * (contactType, category, contactedAt, outreachChannel, outreachCampaignNotes)
 * is an immutable factual record once logged. Only reachable on a SCREENING
 * row (enforced service-side, not here — this DTO doesn't know the row's
 * category).
 */
export class UpdateCandidateContactHistoryDto {
  @ApiProperty({ description: 'New screening notes content' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  screeningNotes!: string;

  @ApiPropertyOptional({
    description:
      "Optimistic concurrency check: the row's own `editedAt ?? createdAt` (ISO 8601) as last seen by the caller. If it no longer matches, the row was changed by someone else in the meantime and the request is rejected with 409.",
  })
  @IsOptional()
  @IsString()
  expectedVersion?: string;
}
