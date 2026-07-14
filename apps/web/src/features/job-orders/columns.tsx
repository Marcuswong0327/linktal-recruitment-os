'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { type JobOrder, type JobOrderStatus, jobOrderStatusLabels, priorityLabels } from './schema';

export const statusVariant: Record<JobOrderStatus, 'info' | 'success' | 'muted' | 'destructive'> = {
  ACTIVE: 'info',
  PLACED: 'success',
  ON_HOLD: 'muted',
  CLOSED: 'destructive',
};

export const priorityVariant: Record<number, 'destructive' | 'warning' | 'muted'> = {
  1: 'destructive',
  2: 'warning',
  3: 'muted',
};

const numberFormatter = new Intl.NumberFormat('en-SG');

function formatSalary(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return '—';
  const prefix = currency ? `${currency} ` : '';
  if (min != null && max != null) {
    return `${prefix}${numberFormatter.format(min)} – ${numberFormatter.format(max)}`;
  }
  return `${prefix}${numberFormatter.format((min ?? max)!)}`;
}

interface JobOrderColumnsOptions {
  /** Resolves a clientId to a display name (client-side join — the API returns IDs only). */
  clientName: (id: string) => string;
  /** Resolves a consultantId to a display name (same reason). */
  consultantName: (id: string | null) => string;
}

export function getJobOrderColumns({ clientName, consultantName }: JobOrderColumnsOptions): ColumnDef<JobOrder>[] {
  return [
    {
      accessorKey: 'displayId',
      header: 'ID',
      size: 90,
      meta: { align: 'center' },
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.displayId}</span>,
    },
    {
      accessorKey: 'jobTitle',
      header: 'Role',
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.jobTitle}</span>
      ),
    },
    {
      accessorKey: 'clientId',
      header: 'Client',
      cell: ({ row }) => <span>{clientName(row.original.clientId)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>
          {jobOrderStatusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'priorityLevel',
      header: 'Priority',
      size: 100,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const priority = row.original.priorityLevel;
        return priority != null ? (
          <Badge variant={priorityVariant[priority]}>{priorityLabels[priority] ?? priority}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: 'salary',
      header: 'Salary Range',
      size: 190,
      accessorFn: (row) => row.salaryMax ?? row.salaryMin ?? 0,
      cell: ({ row }) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatSalary(row.original.salaryMin, row.original.salaryMax, row.original.salaryCurrency)}
        </span>
      ),
    },
    {
      id: 'openings',
      header: 'Filled',
      size: 100,
      meta: { align: 'center' },
      accessorFn: (row) => row.filledCount,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.filledCount} / {row.original.openings}
        </span>
      ),
    },
    {
      accessorKey: 'location',
      header: 'Location',
      size: 150,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.location ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'consultantId',
      header: 'Consultant',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{consultantName(row.original.consultantId)}</span>
      ),
    },
  ];
}
