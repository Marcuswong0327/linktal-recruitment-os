import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

/** Shared by every entity's `POST /export` route — same shape regardless of entity, so one DTO rather than three. */
export class ExportByIdsDto {
  @ApiProperty({ type: [String], description: 'Row IDs to export (an explicit selection, not a filter)' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional({
    description:
      "IANA timezone (e.g. 'Australia/Brisbane') the caller's browser resolved via Intl.DateTimeFormat — date/time export columns are formatted in this zone. Falls back to UTC when omitted or invalid.",
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
