import { ApiProperty } from '@nestjs/swagger';
import { Interview, InterviewOutcome } from '@prisma/client';

/** OpenAPI response shape for an Interview round. */
export class InterviewEntity implements Omit<Interview, 'deletedAt' | 'deletedById'> {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'INT-0001' }) displayId!: string;
  @ApiProperty() submissionId!: string;
  @ApiProperty({ example: '1st Interview' }) roundLabel!: string;
  @ApiProperty() interviewDate!: Date;
  @ApiProperty({ enum: InterviewOutcome }) outcome!: InterviewOutcome;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
