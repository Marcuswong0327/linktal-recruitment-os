import { ApiProperty } from '@nestjs/swagger';

export class ImportRowErrorEntity {
  @ApiProperty({ description: 'The literal Excel row number (header is row 1) this error is on' })
  row!: number;
  @ApiProperty({ description: 'Which column the error is on' })
  column!: string;
  @ApiProperty() message!: string;
}

/**
 * Response for every entity's `POST .../import` (both `commit: false`
 * previews and `commit: true` real imports return this same shape) — see
 * xlsx-import.ts's doc for why the whole file is all-or-nothing: `committed`
 * is only ever true when `errors` is empty and every row in `totalRows` was
 * actually written.
 */
export class ImportResultEntity {
  @ApiProperty({ description: 'Data rows found in the uploaded file (excluding the header)' })
  totalRows!: number;
  @ApiProperty({ description: 'How many rows would be (or were) inserted as new records' })
  insertCount!: number;
  @ApiProperty({ description: 'How many rows would be (or were) applied as updates to an existing record' })
  updateCount!: number;
  @ApiProperty({ type: ImportRowErrorEntity, isArray: true })
  errors!: ImportRowErrorEntity[];
  @ApiProperty({
    description: 'True only when every row was actually written. False for a preview (commit=false) or when any row failed validation — in both cases nothing was written.',
  })
  committed!: boolean;
}
