import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { QueryClientsDto } from './query-clients.dto';

/** Same filters as the list endpoint, minus pagination — export returns every matching row, unbounded, in the same sort order the grid shows. */
export class ExportClientsDto extends OmitType(QueryClientsDto, ['page', 'pageSize'] as const) {
  @ApiPropertyOptional({
    description:
      "IANA timezone (e.g. 'Australia/Brisbane') the caller's browser resolved via Intl.DateTimeFormat — date/time export columns are formatted in this zone. Falls back to UTC when omitted or invalid.",
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
