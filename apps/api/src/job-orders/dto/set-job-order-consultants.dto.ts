import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/**
 * Full-set replace, same pattern as ConsultantsService's
 * setIndustries/setSpecializations/setLocations — not separate add/remove
 * endpoints. No scope check applies: adding someone here on purpose is the
 * one deliberate way to reach an otherwise out-of-scope Client/Candidate.
 */
export class SetJobOrderConsultantsDto {
  @ApiProperty({ type: [String], description: 'Consultant IDs working this job order — replaces the whole set' })
  @IsArray()
  @IsString({ each: true })
  consultantIds!: string[];
}
