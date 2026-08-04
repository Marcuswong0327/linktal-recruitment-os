import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LocationLevel } from '@prisma/client';

/**
 * Admin-only, and rarely the right tool: this tree is bulk-loaded from
 * GeoNames by `scripts/import-locations.ts`. Hand-adding a node that the
 * loader would also produce risks a near-duplicate, which silently changes
 * who can see what — hence the restriction. Use it for a genuine gap the
 * dumps don't cover.
 */
export class CreateLocationDto {
  @ApiProperty({ description: 'Node name', example: 'Silverwater' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: LocationLevel, description: 'Which rung this node sits on' })
  @IsEnum(LocationLevel)
  level!: LocationLevel;

  @ApiPropertyOptional({
    description: 'Parent node. Required for everything except COUNTRY, which sits at the root.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Only meaningful at SUBURB level', example: '2128' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postcode?: string;

  @ApiPropertyOptional({
    description: 'GeoNames id, if this node has one — keeps a later bulk load from duplicating it',
  })
  @IsOptional()
  @IsInt()
  geonameId?: number;
}
