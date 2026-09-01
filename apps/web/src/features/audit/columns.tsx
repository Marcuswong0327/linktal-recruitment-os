'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type AuditLog,
  actionSpec,
  describeActor,
  describeRecord,
  describeScope,
  displayValue,
  entityTypeLabelOf,
  exactTimeLabel,
  exportDetail,
  fullTimestamp,
  hasPreviousValue,
  previewChange,
  relativeTime,
} from './schema';

/**
 * Two lines per row, throughout: the answer on top, the qualifier underneath.
 *
 * The previous single-line layout had to choose one of the two per column and
 * pushed the other behind a `title` tooltip — which is how the most
 * informative column on the page (Changes) ended up readable only on hover.
 * A ~48px row buys every cell its qualifier in the open. This page is a
 * forensics surface, not the shortlist grid `.impeccable.md`'s density
 * principle is written for: the job here is understanding one entry, not
 * scanning two hundred.
 */
function Stack({ children }: { children: React.ReactNode }) {
  return <span className="flex min-w-0 flex-col gap-0.5 leading-tight">{children}</span>;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Sub({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('block truncate text-xs text-muted-foreground', className)}>{children}</span>;
}

export const auditColumns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: 'createdAt',
    header: 'When',
    size: 150,
    cell: ({ row }) => {
      const when = row.original.createdAt;
      return (
        <Stack>
          <span className="block truncate font-medium text-foreground" title={fullTimestamp(when)}>
            {relativeTime(when)}
          </span>
          <Sub className="tabular-nums">{exactTimeLabel(when)}</Sub>
        </Stack>
      );
    },
  },
  {
    accessorKey: 'actorName',
    header: 'Who',
    size: 150,
    enableSorting: false,
    cell: ({ row }) => {
      // Through describeActor, not `actorName ?? actorId`: a purged consultant
      // has an id but no name, and the old fallback printed the raw uuid in
      // the one column a reader scans for a person's name.
      const actor = describeActor(row.original);
      return (
        <Stack>
          <span className="block truncate font-medium text-foreground">{actor.name}</span>
          {actor.unresolvedId ? <Sub>account removed</Sub> : null}
        </Stack>
      );
    },
  },
  {
    accessorKey: 'action',
    header: 'Action',
    size: 140,
    cell: ({ row }) => {
      const spec = actionSpec(row.original.action);
      return (
        <Badge variant={spec.variant}>
          <spec.Icon />
          {spec.label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'entityType',
    // "Entity" is schema vocabulary — an admin thinks in terms of the actual
    // record (a candidate, a client), not database jargon.
    header: 'Record',
    size: 230,
    cell: ({ row }) => {
      const scope = describeScope(row.original);
      const record = describeRecord(row.original, scope);
      return (
        <Stack>
          <span className="block truncate font-medium text-foreground" title={record.title}>
            {record.title}
          </span>
          <Sub>
            {record.typeLabel}
            {/* "archived", not "deleted": the flag is a soft delete, and the
                Action column reserves "Deleted" for the irreversible one. */}
            {row.original.entityDeleted ? <span className="text-warning"> · archived</span> : null}
            {scope.cascadedFromType ? (
              <span> · via {entityTypeLabelOf(scope.cascadedFromType).toLowerCase()}</span>
            ) : null}
          </Sub>
        </Stack>
      );
    },
  },
  {
    id: 'changes',
    header: 'What changed',
    enableSorting: false,
    // Absorbs leftover width on a wide screen — see DataGridColumnMeta.grow.
    meta: { grow: true },
    cell: ({ row }) => <ChangesCell entry={row.original} />,
  },
];

/**
 * The one thing this entry did, in the width of a cell.
 *
 * An export has no field diff at all — it reads, it doesn't write — so the
 * generic "—" that used to appear here said nothing about what was in fact
 * the third most common action in the log. Each shape gets its own answer
 * rather than sharing a placeholder.
 */
function ChangesCell({ entry }: { entry: AuditLog }) {
  const scope = describeScope(entry);

  if (entry.action === 'EXPORT') {
    // Every export row used to lead with "Downloaded as a spreadsheet" — true
    // of all of them, so the column repeated itself down the page and said
    // nothing. Lead with what distinguishes this one: which records, or which
    // filters stood in for them.
    const info = exportDetail(entry, scope);
    const summary = info?.records.length ? info.records.join(', ') : capitalise(info?.how ?? '');
    return (
      <Stack>
        <span className="block truncate text-foreground" title={summary}>
          {summary}
        </span>
        <Sub>downloaded as a spreadsheet</Sub>
      </Stack>
    );
  }

  const preview = previewChange(entry.resolvedChanges);
  if (!preview) {
    return (
      <Stack>
        <span className="block truncate text-muted-foreground">
          {scope.isBulk ? 'No field detail recorded' : 'No field-level changes'}
        </span>
        {entry.omittedFieldCount > 0 ? <Sub>{entry.omittedFieldCount} fields left empty</Sub> : null}
      </Stack>
    );
  }

  const { row, more } = preview;
  const to = displayValue(row.to);
  const from = hasPreviousValue(row.from) ? displayValue(row.from) : null;

  return (
    <Stack>
      <span className="block truncate" title={`${row.fieldLabel}: ${from ? `${from} → ${to}` : to}`}>
        <span className="text-muted-foreground">{row.fieldLabel}</span>{' '}
        {from ? (
          <>
            <span className="text-muted-foreground line-through">{from}</span>
            <span className="text-muted-foreground"> → </span>
          </>
        ) : null}
        <span className="font-medium text-foreground">{to}</span>
      </span>
      {more > 0 || entry.omittedFieldCount > 0 ? (
        <Sub>
          {more > 0 ? `+${more} more ${more === 1 ? 'field' : 'fields'}` : null}
          {more > 0 && entry.omittedFieldCount > 0 ? ' · ' : null}
          {entry.omittedFieldCount > 0 ? `${entry.omittedFieldCount} left empty` : null}
        </Sub>
      ) : null}
    </Stack>
  );
}
