import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/** Full-set replace, same pattern as SetConsultantIndustriesDto — not separate add/remove endpoints. */
export class SetConsultantLocationsDto {
  @ApiProperty({
    type: [String],
    description:
      'Location IDs (see /locations) at any level — replaces the whole set. A grant covers the node plus every descendant, so "All Malaysia" is one COUNTRY id while a desk label like "Brisbane GC QLD" is two CITY ids. Wildcards must already be expanded into concrete ids by the caller.',
  })
  @IsArray()
  @IsString({ each: true })
  locationIds!: string[];
}
