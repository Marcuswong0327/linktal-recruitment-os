import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateInterviewDto } from './create-interview.dto';

// submissionId isn't patchable — an interview round doesn't move to a
// different submission, it gets removed and re-added if that were ever needed.
export class UpdateInterviewDto extends PartialType(OmitType(CreateInterviewDto, ['submissionId'] as const)) {}
