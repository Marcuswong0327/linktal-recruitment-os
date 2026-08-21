import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * One endpoint, one flag — not separate validate/import endpoints (see
 * xlsx-import.ts's doc). Arrives as a multipart form field alongside the
 * uploaded file, so it's always a string on the wire ("true"/"false") even
 * though the DTO's own type is boolean; `@Transform` coerces it the same way
 * every other multipart-form boolean in this app would need to.
 */
export class ImportOptionsDto {
  @ApiPropertyOptional({
    description: 'Write the rows if (and only if) every row passes validation. Default: false — preview only, nothing is written.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  commit?: boolean;
}
