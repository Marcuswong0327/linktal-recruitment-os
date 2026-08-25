import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';
import { QueryStakeholdersDto } from './query-stakeholders.dto';

/**
 * Backs `GET /stakeholders/enrichment` — the cross-company enrichment
 * workspace's fetch. Same filter shape as `ExportStakeholdersDto` (every
 * matching row, unbounded, no `page`/`pageSize`), but `clientIds` is
 * required here rather than optional: this endpoint exists specifically to
 * answer "every stakeholder across this hand-picked set of companies," and
 * requiring the array at the DTO level (not a runtime `if`) is what keeps it
 * from ever silently becoming "dump the whole table."
 */
export class EnrichmentStakeholdersDto extends OmitType(QueryStakeholdersDto, ['page', 'pageSize', 'clientIds'] as const) {
  @ApiProperty({
    description: 'Company IDs to fetch stakeholders for — required, at least one.',
    type: [String],
  })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  clientIds!: string[];
}
