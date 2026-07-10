import { ApiProperty } from '@nestjs/swagger';
import { Permission } from '@prisma/client';

/** OpenAPI response shape for a Permission (read-only; the catalog is static). */
export class PermissionEntity implements Permission {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'candidate' }) resource!: string;
  @ApiProperty({ example: 'read' }) action!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() createdAt!: Date;
}
