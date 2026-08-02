import { ApiProperty } from '@nestjs/swagger';
import { JobOrder, JobOrderQuality, JobOrderStatus, LocationLevel, SubmissionStatus } from '@prisma/client';

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
 *
 * `jobTitle`/`jobRoleType`/`location` aren't part of the raw `JobOrder` model
 * (only the FK ids are) — they're the FKs' resolved names, added here so
 * callers get plain strings instead of joining against /job-titles,
 * /job-role-types or /locations themselves. Same reasoning as
 * CandidateEntity.industry.
 */
export class JobOrderEntity implements Omit<JobOrder, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'JO-0001' }) displayId!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty({ type: String, nullable: true }) consultantId!: string | null;
  @ApiProperty({ type: String, nullable: true }) jobTitleId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Production Manager',
    description: "Resolved job title — the client's own words for the role",
  })
  jobTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) jobRoleTypeId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Resolved role type name — the consultant's classification of the same job",
  })
  jobRoleType!: string | null;
  @ApiProperty({ type: String, nullable: true }) locationId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved location name' })
  location!: string | null;
  @ApiProperty({
    enum: LocationLevel,
    nullable: true,
    description: 'Which rung of the geography tree `location` sits on',
  })
  locationLevel!: LocationLevel | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The ClientJobResearch row this job order originated from, if any',
  })
  jobResearchId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) salaryMin!: number | null;
  @ApiProperty({ type: Number, nullable: true }) salaryMax!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'AUD' }) salaryCurrency!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Forecast value, entered before anyone is placed — distinct from a Placement fee',
  })
  estimatedValue!: number | null;
  @ApiProperty({ example: 1 }) openings!: number;
  @ApiProperty({ example: 0 }) filledCount!: number;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) requirements!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Briefing notes — internal, distinct from the public-facing description/requirements copy',
  })
  notes!: string | null;
  @ApiProperty({ enum: JobOrderStatus }) status!: JobOrderStatus;
  @ApiProperty({ enum: JobOrderQuality }) quality!: JobOrderQuality;
  @ApiProperty({ type: Number, nullable: true, description: '1=High, 2=Medium, 3=Low' }) priorityLevel!: number | null;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) closedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: JobOrderPipelineCandidateEntity, isArray: true })
  pipelineSubmissions!: JobOrderPipelineCandidateEntity[];
}
