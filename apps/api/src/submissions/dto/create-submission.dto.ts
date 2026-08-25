import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubmissionStatus } from '@prisma/client';

export class CreateSubmissionDto {
  @ApiProperty({ description: 'Candidate being submitted' })
  @IsString()
  candidateId!: string;

  @ApiProperty({ description: 'Job order being submitted to' })
  @IsString()
  jobOrderId!: string;

  @ApiPropertyOptional({ description: 'Status; defaults to SUBMITTED when omitted', enum: SubmissionStatus, example: 'SUBMITTED' })
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  // Tri-state, not set at creation time — always starts "undecided" (null)
  // and is only ever changed via PATCH from the Job Order pipeline table. See
  // the schema.prisma comment on CandidateSubmission for why these are their
  // own columns rather than derived from `status`. `@IsOptional()` skips
  // validation for an explicit `null` too (class-validator treats null and
  // undefined alike), so a PATCH can reset a stage back to "undecided".
  @ApiPropertyOptional({
    description: 'Client shortlisted this candidate to interview — tri-state, gates the interview stage',
    type: Boolean,
    nullable: true,
  })
  @IsOptional()
  @IsBoolean()
  shortlisted?: boolean | null;

  @ApiPropertyOptional({
    description: 'Candidate accepted the offer — tri-state, gates the starting-date field',
    type: Boolean,
    nullable: true,
  })
  @IsOptional()
  @IsBoolean()
  cddAccepted?: boolean | null;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
