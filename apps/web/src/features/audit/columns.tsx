'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type AuditLog,
  auditActionLabels,
  auditActionVariants,
  summarizeChanges,
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
    header: 'Entity',
    size: 240,
    cell: ({ row }) => {
      const { entityType, entityLabel, entityId } = row.original;
      return (
        // Full id in the tooltip for support/debugging; label for humans.
        <span className="block truncate" title={entityId}>
          <span className="font-medium text-foreground">{entityType}</span>{' '}
          <span className="text-muted-foreground">{entityLabel ?? entityId}</span>
        </span>
      );
    },
  },
  {
    id: 'changes',
    header: 'Changes',
    enableSorting: false,
    cell: ({ row }) => {
      const summary = summarizeChanges(row.original.changes);
      return (
        <span className={cn('block truncate text-sm text-muted-foreground')} title={summary}>
          {summary}
        </span>
      );
    },
  },
];
