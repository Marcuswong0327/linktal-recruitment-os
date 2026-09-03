import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin-only, and only ever reaches a row admin created themselves — the 13
 * seeded rows are `isProtected` and the service rejects this outright for
 * them. Rename, or (for a CITY_COVERAGE) reparent onto a different country.
 */
export class UpdateLocationDto {
  @ApiPropertyOptional({ description: 'New name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'New parent country (CITY_COVERAGE only). Omit to leave the current parent unchanged.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}
