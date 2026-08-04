import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LocationLevel } from '@prisma/client';

export class QueryLocationsDto {
  @ApiPropertyOptional({
    description:
      'Filter by name (contains, case-insensitive). Backed by a trigram index, so a substring search stays an index scan.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Only nodes on this rung of the tree',
    enum: LocationLevel,
  })
  @IsOptional()
  @IsEnum(LocationLevel)
  level?: LocationLevel;

  @ApiPropertyOptional({
    description:
      "Only this node's direct children — what a cascading picker asks for after each step (pick a country, list its states).",
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'Only nodes at or beneath this one, at any depth — resolved through the ancestor path, so one country id matches every node under it.',
  })
  @IsOptional()
  @IsString()
  underId?: string;

  @ApiPropertyOptional({
    description: 'Maximum rows to return. The tree is ~2k nodes today and grows, so reads are always capped.',
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take: number = 50;
}
