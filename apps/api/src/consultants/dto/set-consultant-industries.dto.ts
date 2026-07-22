import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/** Full-set replace, same pattern as CandidateSpecialization's `specializationIds` — not separate add/remove endpoints. */
export class SetConsultantIndustriesDto {
  @ApiProperty({ type: [String], description: 'Industry IDs (see /industries) — replaces the whole set' })
  @IsArray()
  @IsString({ each: true })
  industryIds!: string[];
}
