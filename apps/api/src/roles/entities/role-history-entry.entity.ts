import { ApiProperty } from '@nestjs/swagger';

/**
 * One past save of a Role, reshaped from its own `AuditLog` rows (see
 * RolesService.logRoleChange) rather than a dedicated versioning table —
 * every CREATE/UPDATE already writes the full resulting name/description/
 * permissionIds, so each row here is already a complete, restorable
 * snapshot, not a diff. The most recent entry is always the role's current
 * state.
 */
export class RoleHistoryEntryEntity {
  @ApiProperty({ description: 'The underlying AuditLog row id — pass this to POST /roles/:id/restore' })
  id!: string;
  @ApiProperty({ enum: ['CREATE', 'UPDATE'] })
  action!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Consultant.id who made this save; null for system/import' })
  actorId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Resolved name of the consultant who made this save' })
  actorName!: string | null;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({
    type: String,
    isArray: true,
    nullable: true,
    description:
      "The full permission set as of this save. Null when this particular save didn't touch permissions (name/description-only edit) — such a row can't be restored, since it isn't a complete snapshot.",
  })
  permissionIds!: string[] | null;
  @ApiProperty() createdAt!: Date;
}
