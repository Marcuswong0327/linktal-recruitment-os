import { ApiProperty } from '@nestjs/swagger';

/** OpenAPI response shape for one activity-log entry (AuditLog + resolved actor). */
export class AuditLogEntity {
  @ApiProperty() id!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Acting consultant id (null = system)' })
  actorId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Acting consultant name, resolved for display' })
  actorName!: string | null;

  @ApiProperty({ example: 'SOFT_DELETE' }) action!: string;

  @ApiProperty({ example: 'Candidate' }) entityType!: string;

  @ApiProperty() entityId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'CDD-0042 · Jane Doe',
    description: 'Human label (displayId + name); null if the entity was hard-deleted',
  })
  entityLabel!: string | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Field-level diff { field: { from, to } }, or created snapshot',
  })
  changes!: unknown;

  @ApiProperty({ type: Object, nullable: true, description: 'requestId / cascade / count etc.' })
  metadata!: unknown;

  @ApiProperty() createdAt!: Date;
}
