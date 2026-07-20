import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** One entry in Candidate.notes' JSONB timeline. Mirrors ClientNoteDto. */
export class CandidateNoteDto {
  @ApiProperty({ description: 'Stable id, unique within this candidate’s notes (for edit/delete)' })
  id!: string;

  @ApiProperty({ example: 'Called to confirm availability for the panel interview.' })
  content!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp', example: '2026-07-16T18:58:34.123Z' })
  timestamp!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Authoring consultant ID' })
  by!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'ISO 8601 timestamp of the last edit, null if never edited',
  })
  editedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Consultant ID who made the last edit, null if never edited (may differ from `by`, e.g. an admin editing someone else’s note)',
  })
  editedBy!: string | null;
}

export class AddCandidateNoteDto {
  @ApiProperty({ description: 'Note content', example: 'Called to confirm availability for the panel interview.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}

export class UpdateCandidateNoteDto {
  @ApiProperty({ description: 'New note content', example: 'Called to confirm availability for the panel interview.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({
    description:
      "Optimistic concurrency check: the note's own `editedAt ?? timestamp` as last seen by the caller. If it no longer matches, the note was changed by someone else in the meantime and the request is rejected with 409.",
  })
  @IsOptional()
  @IsString()
  expectedVersion?: string;
}

export class DeleteCandidateNoteQueryDto {
  @ApiPropertyOptional({
    description:
      "Optimistic concurrency check: the note's own `editedAt ?? timestamp` as last seen by the caller. If it no longer matches, the note was changed by someone else in the meantime and the request is rejected with 409.",
  })
  @IsOptional()
  @IsString()
  expectedVersion?: string;
}
