import { ApiProperty } from '@nestjs/swagger';

/**
 * One selectable option for the activity log's "Record type" filter.
 *
 * Served from the API rather than hand-listed in the frontend because that
 * list has now drifted twice: the write-side set (`AUDITED_MODELS`) and the
 * types that actually appear in the table are both moving targets, and a
 * missing option means the filter silently can't reach rows the grid is
 * already showing — the exact failure mode `.impeccable.md`'s "never silently
 * drop a filter" principle exists to prevent.
 */
export class AuditEntityTypeEntity {
  @ApiProperty({ example: 'JobOrder', description: 'The raw Prisma model name — what `entityType` filters on' })
  value!: string;

  @ApiProperty({ example: 'Job Order', description: 'Human name, from the same map every row label uses' })
  label!: string;
}
