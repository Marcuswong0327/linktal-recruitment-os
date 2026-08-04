import { PartialType } from '@nestjs/swagger';
import { CreateJobResearchDto } from './create-job-research.dto';

export class UpdateJobResearchDto extends PartialType(CreateJobResearchDto) {}
