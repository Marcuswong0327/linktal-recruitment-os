'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import {
  type Candidate,
  candidateStatuses,
  candidateStatusLabels,
} from './schema';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const salaryFormatter = new Intl.NumberFormat('en-SG', {
  style: 'currency',
  currency: 'SGD',
  maximumFractionDigits: 0,
});

type CandidateStatus = (typeof candidateStatuses)[number];

const statusVariant: Record<
  CandidateStatus,
  'muted' | 'info' | 'warning' | 'default' | 'success' | 'destructive'
> = {
  APPLIED: 'muted',
  SCREENING: 'info',
  INTERVIEW: 'warning',
  OFFER: 'default',
  HIRED: 'success',
  REJECTED: 'destructive',
};

export const candidateColumns: ColumnDef<Candidate>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
      const candidate = row.original;
      return (
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {initials(candidate.name)}
          </span>
          <span className="font-medium text-foreground">{candidate.name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'role',
    header: 'Current Title',
    cell: ({ row }) => <span>{row.original.role}</span>,
  },
  {
    accessorKey: 'currentCompany',
    header: 'Company',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.currentCompany}</span>
    ),
  },
  {
    accessorKey: 'location',
    header: 'Location',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.location}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>
        {candidateStatusLabels[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: 'expectedSalary',
    header: 'Expected',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {salaryFormatter.format(row.original.expectedSalary)}
      </span>
    ),
  },
  {
    accessorKey: 'noticePeriodDays',
    header: 'Notice',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.noticePeriodDays} days</span>
    ),
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.owner}</span>
    ),
  },
];
