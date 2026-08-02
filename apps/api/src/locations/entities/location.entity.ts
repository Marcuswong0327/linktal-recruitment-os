import { ApiProperty } from '@nestjs/swagger';
import { Location, LocationLevel } from '@prisma/client';

/**
 * OpenAPI response shape for a Location — one node of the geography tree.
 *
 * `ancestorIds` is exposed deliberately: it's how the frontend can tell
 * whether one node sits under another (breadcrumbs, "is this inside my
 * patch") without walking `parentId` one request at a time. Root-last, self
 * included — Silverwater is `[silverwater, sydney, nsw, australia]`.
 */
export class LocationEntity implements Location {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Sydney' }) name!: string;
  @ApiProperty({ enum: LocationLevel }) level!: LocationLevel;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Only ever set at SUBURB level',
  })
  postcode!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'GeoNames id — what makes the bulk load idempotent and re-runnable',
  })
  geonameId!: number | null;
  @ApiProperty({ type: String, nullable: true, description: 'null at COUNTRY level' })
  parentId!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Self plus every ancestor, root-last',
  })
  ancestorIds!: string[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
