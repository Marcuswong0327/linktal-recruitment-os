import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/**
 * Full-set replace for a job order's key stakeholders — same shape as
 * SetJobOrderConsultantsDto. Each id must belong to the job order's client.
 */
export class SetJobOrderKeyStakeholdersDto {
  @ApiProperty({
    type: [String],
    description: 'Stakeholder IDs that are key contacts for this job order — replaces the whole set',
  })
  @IsArray()
  @IsString({ each: true })
  stakeholderIds!: string[];
}
