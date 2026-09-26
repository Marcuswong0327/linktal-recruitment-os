import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/**
 * Full-set replace of a company's manual assignees — same pattern as
 * SetJobOrderConsultantsDto. Does not mutate JobOrderConsultant rows.
 */
export class SetClientConsultantsDto {
  @ApiProperty({
    type: [String],
    description: 'Consultant IDs assigned to this company — replaces the whole ClientConsultant set',
  })
  @IsArray()
  @IsString({ each: true })
  consultantIds!: string[];
}
