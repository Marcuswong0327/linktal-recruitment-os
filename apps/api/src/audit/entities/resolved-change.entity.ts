import { ApiProperty } from '@nestjs/swagger';

/** One side (before or after) of a resolved field change. */
export class ResolvedValue {
  @ApiProperty({ type: Object, nullable: true, description: 'Exactly what is stored — never replaced, even when a label is available' })
  raw!: unknown;

  @ApiProperty({ type: String, nullable: true, description: 'Human label; null when the raw value is null, or when an id could not be resolved (e.g. a hard-purged record)' })
  label!: string | null;

  @ApiProperty({
    enum: ['fk', 'fk-list', 'enum', 'date', 'plain'],
    description:
      '"fk" = raw was an id resolved via targetType; "fk-list" = raw was an array of ids, label is the resolved names; "enum" = raw was a schema enum value; "date" = raw is an ISO instant the client must format in the reader\'s own timezone (label is null); "plain" = shown as-is',
  })
  kind!: 'fk' | 'fk-list' | 'enum' | 'date' | 'plain';

  @ApiProperty({ type: String, required: false, description: 'The model the id was resolved against (e.g. "Industry") — enables deep-linking from the UI. Only present when kind is "fk".' })
  targetType?: string;

  @ApiProperty({ type: Boolean, required: false, description: 'True when the resolved fk target is soft-deleted' })
  deleted?: boolean;

  @ApiProperty({ type: Boolean, required: false, description: 'True when this value was suppressed (e.g. Consultant salary/costTo) rather than shown, regardless of raw' })
  redacted?: boolean;
}

/** One field's before -> after, with both sides already resolved to human labels where possible. */
export class ResolvedChange {
  @ApiProperty({ example: 'industryId' }) field!: string;
  @ApiProperty({ example: 'Industry' }) fieldLabel!: string;
  @ApiProperty({ type: ResolvedValue }) from!: ResolvedValue;
  @ApiProperty({ type: ResolvedValue }) to!: ResolvedValue;
}
