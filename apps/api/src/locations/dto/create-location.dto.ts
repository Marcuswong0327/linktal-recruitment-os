import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LocationLevel } from '@prisma/client';

/**
 * Admin-only. The 13 seeded rows (2 countries + 11 approved City Coverage
 * values) are the business's fixed catalog and can't be edited or deleted —
 * this endpoint is for adding to it: a new country, or a new City Coverage
 * value under an existing one.
 */
export class CreateLocationDto {
  @ApiProperty({ description: 'Node name', example: 'Adelaide SA' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: LocationLevel, description: 'COUNTRY, or CITY_COVERAGE under an existing country' })
  @IsEnum(LocationLevel)
  level!: LocationLevel;

  @ApiPropertyOptional({
    description: 'Parent country. Required for CITY_COVERAGE; must be omitted for COUNTRY, which sits at the root.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}
