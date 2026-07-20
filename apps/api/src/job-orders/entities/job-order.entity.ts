import { ApiProperty } from '@nestjs/swagger';
import { JobOrder, JobOrderQuality, JobOrderStatus, SubmissionStatus } from '@prisma/client';

/**
 * One candidate submitted to a job order, for the Job Orders sheet's
 * Candidates roster column plus the derived Candidate Submitted/Placed/Latest
 * Submission Date columns. Deliberately thin (id + name + status + date) —
 * the full submission record (notes, etc.) is fetched separately on the
 * dedicated Job Order page via /candidate-submissions.
 */
export class JobOrderPipelineCandidateEntity {
  @ApiProperty() submissionId!: string;
  @ApiProperty() candidateId!: string;
  @ApiProperty() candidateName!: string;
  @ApiProperty({ enum: SubmissionStatus }) status!: SubmissionStatus;
  @ApiProperty() submittedAt!: Date;
  @ApiProperty({ type: Date, nullable: true, description: "This submission's most recent interview round" })
  latestInterviewDate!: Date | null;
  @ApiProperty({ type: Number, nullable: true }) placementBaseSalary!: number | null;
  @ApiProperty({ type: Number, nullable: true }) placementFeeValue!: number | null;
  @ApiProperty({ type: Date, nullable: true }) placementStartDate!: Date | null;
}

/**
 * OpenAPI response shape for a JobOrder.
 *
 * `implements JobOrder` ties this class to the Prisma model at compile time,
 * keeping the generated frontend types honest to the database (the source of
 * truth). Nullable columns use `@ApiProperty({ nullable: true })` with an
 * explicit `type`, because Prisma always returns the column, just as `null`.
 */
export class JobOrderEntity implements Omit<JobOrder, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'JO-0001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty({ example: 'Production Manager' }) jobTitle!: string;
  @ApiProperty({ type: String, nullable: true }) department!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) suburb!: string | null;
  @ApiProperty({ type: Number, nullable: true }) salaryMin!: number | null;
  @ApiProperty({ type: Number, nullable: true }) salaryMax!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'AUD' }) salaryCurrency!: string | null;
  @ApiProperty({ example: 1 }) openings!: number;
  @ApiProperty({ example: 0 }) filledCount!: number;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) requirements!: string | null;
  @ApiProperty({ enum: JobOrderStatus }) status!: JobOrderStatus;
  @ApiProperty({ enum: JobOrderQuality }) quality!: JobOrderQuality;
  @ApiProperty({ type: Number, nullable: true, description: '1=High, 2=Medium, 3=Low' }) priorityLevel!: number | null;
  @ApiProperty() isReplacement!: boolean;
  @ApiProperty() isCollaborated!: boolean;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) closedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: JobOrderPipelineCandidateEntity, isArray: true })
  pipelineSubmissions!: JobOrderPipelineCandidateEntity[];
}
