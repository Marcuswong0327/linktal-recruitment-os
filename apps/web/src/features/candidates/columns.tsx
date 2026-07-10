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

type CandidateStatus = (typeof candidateStatuses)[number];

const statusVariant: Record<
  CandidateStatus,
  'muted' | 'info' | 'warning' | 'default' | 'success' | 'destructive'
> = {
  COLD: 'muted',
  WARM: 'warning',
  HOT: 'destructive',
  PLACED: 'success',
};

function MutedCell({ value }: { value: string | null }) {
  return <span className="text-muted-foreground">{value || '—'}</span>;
}

export const candidateColumns: ColumnDef<Candidate>[] = [
  {
    accessorKey: 'displayId',
    header: 'ID',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.displayId}
      </span>
    ),
  },
  {
    accessorKey: 'fullName',
    header: 'Name',
    cell: ({ row }) => {
      const candidate = row.original;
      return (
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {initials(candidate.fullName)}
          </span>
          <span className="font-medium text-foreground">
            {candidate.fullName}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'currentPosition',
    header: 'Current Title',
    cell: ({ row }) => <MutedCell value={row.original.currentPosition} />,
  },
  {
    accessorKey: 'currentCompany',
    header: 'Company',
    cell: ({ row }) => <MutedCell value={row.original.currentCompany} />,
  },
  {
    accessorKey: 'city',
    header: 'Location',
    cell: ({ row }) => (
      <MutedCell
        value={[row.original.city, row.original.country]
          .filter(Boolean)
          .join(', ')}
      />
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
    accessorKey: 'salaryExpectation',
    header: 'Expected',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.salaryExpectation || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'yearsExperience',
    header: 'Experience',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.yearsExperience != null
          ? `${row.original.yearsExperience} yrs`
          : '—'}
      </span>
    ),
  },
];
