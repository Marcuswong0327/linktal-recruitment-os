'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { cn } from '@/lib/utils';
import { CandidateStatusCell } from './StatusCell';
import type { Candidate } from './schema';

function MutedCell({ value, className }: { value: string | null; className?: string }) {
  return (
    <span title={value || undefined} className={cn('text-muted-foreground', className)}>
      {value || '—'}
    </span>
  );
}

export const candidateColumns: ColumnDef<Candidate>[] = [
  {
    accessorKey: 'displayId',
    header: 'ID',
    size: 90,
    meta: { align: 'center' },
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.displayId}</span>,
  },
  {
    accessorKey: 'fullName',
    header: 'Name',
    cell: ({ row }) => (
      <span title={row.original.fullName} className="block truncate font-medium text-foreground">
        {row.original.fullName}
      </span>
    ),
  },
  {
    accessorKey: 'currentPosition',
    header: 'Current Title',
    cell: ({ row }) => <MutedCell value={row.original.currentPosition} className="block truncate" />,
  },
  {
    accessorKey: 'currentCompany',
    header: 'Company',
    cell: ({ row }) => <MutedCell value={row.original.currentCompany} className="block truncate" />,
  },
  {
    accessorKey: 'city',
    header: 'Location',
    size: 170,
    cell: ({ row }) => (
      <MutedCell
        value={[row.original.city, row.original.country].filter(Boolean).join(', ')}
        className="block truncate"
      />
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    size: 110,
    meta: { align: 'center' },
    cell: ({ row }) => <CandidateStatusCell candidate={row.original} />,
  },
  {
    accessorKey: 'salaryExpectation',
    header: 'Expected',
    size: 130,
    meta: { align: 'center' },
    enableSorting: false,
    cell: ({ row }) => (
      <span title={row.original.salaryExpectation || undefined} className="block truncate tabular-nums">
        {row.original.salaryExpectation || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'yearsExperience',
    header: 'Experience',
    size: 120,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.yearsExperience != null ? `${row.original.yearsExperience} yrs` : '—'}
      </span>
    ),
  },
];
