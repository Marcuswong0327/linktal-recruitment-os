'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type AuditLog,
  auditActionLabels,
  auditActionVariants,
  summarizeResolvedChanges,
} from './schema';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTime(iso: string | Date) {
  return dateFormatter.format(new Date(iso));
}

export const auditColumns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: 'createdAt',
    header: 'When',
    size: 170,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground tabular-nums">
        {formatDateTime(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: 'actorName',
    header: 'Actor',
    size: 150,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block truncate font-medium text-foreground">
        {row.original.actorName ?? (row.original.actorId ? row.original.actorId : 'System')}
      </span>
    ),
  },
  {
    accessorKey: 'action',
    header: 'Action',
    size: 120,
    meta: { align: 'center' },
    cell: ({ row }) => {
      const action = row.original.action;
      return (
        <Badge variant={auditActionVariants[action] ?? 'secondary'}>
          {auditActionLabels[action] ?? action}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'entityType',
    // "Entity" is schema vocabulary — an admin thinks in terms of the actual
    // record (a candidate, a client), not database jargon.
    header: 'Record',
    size: 220,
    cell: ({ row }) => {
      const { entityTypeLabel, entityLabel, entityId, entityDeleted } = row.original;
      // Lead with the resolved name — "Jane Doe (Candidate)" reads more
      // naturally than "Candidate — Jane Doe", and the type is still there
      // for anyone scanning by kind. entityLabel is null only when nothing
      // (not even the diff's own fields) could be resolved — a raw
      // placeholder like "(unknown)" is never shown as if it were a name.
      const name = entityLabel ?? `A ${entityTypeLabel.toLowerCase()} record`;
      return (
        <span className="block truncate" title={entityId}>
          <span className="font-medium text-foreground">{name}</span>{' '}
          <span className="text-muted-foreground">({entityTypeLabel})</span>
          {/* "archived", not "deleted": the flag is a soft delete, and the
              Action column reserves "Deleted" for the irreversible one. */}
          {entityDeleted ? <span className="ml-1 text-warning">· archived</span> : null}
        </span>
      );
    },
  },
  {
    id: 'changes',
    header: 'Changes',
    enableSorting: false,
    cell: ({ row }) => {
      const summary = summarizeResolvedChanges(row.original.resolvedChanges);
      return (
        <span className={cn('block truncate text-sm text-muted-foreground')} title={summary}>
          {summary}
        </span>
      );
    },
  },
];
