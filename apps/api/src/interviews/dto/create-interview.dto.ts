import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { InterviewOutcome } from '@prisma/client';

export class CreateInterviewDto {
  @ApiProperty({ description: 'Submission this interview round belongs to' })
  @IsString()
  submissionId!: string;

  @ApiProperty({ description: 'Round label', example: '1st Interview' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  roundLabel!: string;

  @ApiProperty({ description: 'When this round is/was scheduled' })
  @IsDateString()
  interviewDate!: string;

  @ApiPropertyOptional({ description: 'Outcome; defaults to SCHEDULED when omitted', enum: InterviewOutcome, example: 'SCHEDULED' })
  @IsOptional()
  @IsEnum(InterviewOutcome)
  outcome?: InterviewOutcome;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
