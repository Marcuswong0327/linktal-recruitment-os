import { ApiProperty } from '@nestjs/swagger';
import { Location, LocationLevel } from '@prisma/client';

/**
 * OpenAPI response shape for a Location — one node of the two-rung
 * Country / City Coverage tree.
 *
 * `ancestorIds` is exposed deliberately: it's how the frontend can tell
 * whether one node sits under another without a second request. Root-last,
 * self included — a City Coverage row is `[self, country]`.
 */
export class LocationEntity implements Location {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Sydney NSW' }) name!: string;
  @ApiProperty({ enum: LocationLevel }) level!: LocationLevel;
  @ApiProperty({
    description: 'Part of the approved 13-row catalog — cannot be renamed, reparented or deleted by anyone',
  })
  isProtected!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'null at COUNTRY level' })
  parentId!: string | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Self plus parent, root-last',
  })
  ancestorIds!: string[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
