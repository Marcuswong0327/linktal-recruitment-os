'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import {
  type JobOrder,
  type JobOrderStatus,
  jobOrderStatusLabels,
} from './schema';

const salaryFormatter = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 0,
});

const statusVariant: Record<
  JobOrderStatus,
  'info' | 'default' | 'warning' | 'success' | 'muted' | 'destructive'
> = {
  OPEN: 'info',
  SUBMITTED: 'default',
  INTERVIEWING: 'warning',
  OFFER: 'default',
  PLACED: 'success',
  ON_HOLD: 'muted',
  CLOSED: 'destructive',
};

export const jobOrderColumns: ColumnDef<JobOrder>[] = [
  {
    accessorKey: 'title',
    header: 'Role',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">{row.original.title}</span>
    ),
  },
  {
    accessorKey: 'company',
    header: 'Client',
    cell: ({ row }) => <span>{row.original.company}</span>,
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
    id: 'salary',
    header: 'Salary Range',
    size: 190,
    accessorFn: (row) => row.salaryMax,
    cell: ({ row }) => (
      <span className="tabular-nums whitespace-nowrap">
        {salaryFormatter.format(row.original.salaryMin)} –{' '}
        {salaryFormatter.format(row.original.salaryMax)}
      </span>
    ),
  },
  {
    accessorKey: 'feeValue',
    header: 'Fee',
    size: 120,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {salaryFormatter.format(row.original.feeValue)}
      </span>
    ),
  },
  {
    accessorKey: 'candidateCount',
    header: 'Candidates',
    size: 110,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.candidateCount}</span>
    ),
  },
  {
    accessorKey: 'location',
    header: 'Location',
    size: 150,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.location}</span>
    ),
  },
  {
    accessorKey: 'consultant',
    header: 'Consultant',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.consultant}</span>
    ),
  },
];
