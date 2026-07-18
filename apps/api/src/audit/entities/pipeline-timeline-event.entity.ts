import { ApiProperty } from '@nestjs/swagger';

/**
 * One pipeline-stage event for a CandidateSubmission, read back out of
 * AuditLog (no separate write-side table — CandidateSubmission is already an
 * audited model, so every status change is already captured as a generic
 * field diff; this just reshapes that into a friendly, denormalized event).
 */
export class PipelineTimelineEventEntity {
  @ApiProperty() submissionId!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty({ type: String, nullable: true, description: "Resolved candidate name" })
  candidateName!: string | null;
  @ApiProperty() jobOrderId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved job order title' })
  jobOrderTitle!: string | null;

  @ApiProperty({
    enum: ['SUBMITTED', 'STAGE_CHANGE', 'REMOVED', 'RESTORED'],
    description:
      'SUBMITTED = candidate submitted to this job order; STAGE_CHANGE = status transition (incl. moving backward); REMOVED = taken off the job order (soft-deleted); RESTORED = re-added after removal',
  })
  kind!: 'SUBMITTED' | 'STAGE_CHANGE' | 'REMOVED' | 'RESTORED';

  @ApiProperty({ type: String, nullable: true }) previousStage!: string | null;
  @ApiProperty({ type: String, nullable: true }) newStage!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Consultant who made the change' })
  actorId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved consultant name' })
  actorName!: string | null;

  @ApiProperty() occurredAt!: Date;
}
