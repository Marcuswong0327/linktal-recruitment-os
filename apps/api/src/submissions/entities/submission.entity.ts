import { ApiProperty } from '@nestjs/swagger';
import { CandidateSubmission, SubmissionStatus } from '@prisma/client';

/**
 * OpenAPI response shape for a CandidateSubmission.
 *
 * `candidateName`/`jobOrderTitle` aren't part of the raw model — resolved FK
 * names, same reasoning as ClientEntity.industry — so callers (esp. the
 * Candidate/Job Order detail pages, which each only know one side) get a
 * plain string instead of joining themselves.
 */
export class SubmissionEntity implements Omit<CandidateSubmission, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'SUB-0001' }) displayId!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved candidate name' })
  candidateName!: string | null;
  @ApiProperty() jobOrderId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved job order title' })
  jobOrderTitle!: string | null;
  @ApiProperty({ enum: SubmissionStatus }) status!: SubmissionStatus;
  @ApiProperty() submittedAt!: Date;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
