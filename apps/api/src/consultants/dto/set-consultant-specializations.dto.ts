import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/** Full-set replace, same pattern as SetConsultantIndustriesDto — not separate add/remove endpoints. */
export class SetConsultantSpecializationsDto {
  @ApiProperty({
    type: [String],
    description:
      'Specialization IDs (see /specializations) — replaces the whole set. Grant the coarse parent ("Food"); it covers every child ("Food Bakery", "Food Meat", ...).',
  })
  @IsArray()
  @IsString({ each: true })
  specializationIds!: string[];
}
