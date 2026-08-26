import { ApiProperty } from '@nestjs/swagger';
import { ResolvedChange } from './resolved-change.entity';

/** OpenAPI response shape for one activity-log entry (AuditLog + resolved actor). */
export class AuditLogEntity {
  @ApiProperty() id!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Acting consultant id (null = system)' })
  actorId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Acting consultant name, resolved for display' })
  actorName!: string | null;

  @ApiProperty({ example: 'SOFT_DELETE' }) action!: string;

  @ApiProperty({ example: 'Candidate', description: 'The raw Prisma model name — prefer entityTypeLabel for display' })
  entityType!: string;

  @ApiProperty({
    example: 'Job Order',
    description: "Human name for entityType (e.g. ConsultantIndustry -> \"Industry Assignment\") — what an admin who doesn't know the schema should see",
  })
  entityTypeLabel!: string;

  @ApiProperty() entityId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'CDD-000042 · Jane Doe',
    description: 'Human label (displayId + name); falls back to a label synthesized from the diff\'s own resolved fields when the entity itself has no single id to resolve (e.g. a composite-key grant row) or has since been hard-purged; null only when neither is available',
  })
  entityLabel!: string | null;

  @ApiProperty({ description: "True when the row's own entity is soft-deleted" })
  entityDeleted!: boolean;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Raw field-level diff { field: { from, to } }, or the raw created/deleted snapshot — unchanged, kept for completeness. Prefer resolvedChanges for display.',
  })
  changes!: unknown;

  @ApiProperty({ type: Object, nullable: true, description: 'requestId / cascade / count etc.' })
  metadata!: unknown;

  @ApiProperty({
    type: [ResolvedChange],
    nullable: true,
    description: 'Every field in `changes`, with foreign-key ids resolved to labels and enum values resolved to display labels — what the UI should render.',
  })
  resolvedChanges!: ResolvedChange[] | null;

  @ApiProperty({
    description: 'How many raw fields a CREATE snapshot omitted as noise (nulls, ids, timestamps). 0 for every other action.',
  })
  omittedFieldCount!: number;

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['CLI-001614 · UOB Asset Management (Malaysia)'],
    description:
      'The records this entry covers, resolved to labels and capped — a hand-picked export\'s selection, or the rows a bulk write touched. Null when the entry names no ids (a filtered export, or an ordinary single-record write where entityId already says which row).',
  })
  affectedRecords!: string[] | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Correlation id shared by every entry written by the same request — the key behind "part of a larger action".',
  })
  requestId!: string | null;

  @ApiProperty({
    description: 'How many OTHER entries came from the same request. 0 when this entry stands alone.',
  })
  relatedCount!: number;

  @ApiProperty() createdAt!: Date;
}
