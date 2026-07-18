import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
