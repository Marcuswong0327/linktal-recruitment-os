'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

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
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/candidates/${row.original.id}`}
        onClick={(e) => e.stopPropagation()}
        title={row.original.fullName}
        className="block truncate font-medium text-foreground hover:underline"
      >
        {row.original.fullName}
      </Link>
    ),
  },
  {
    accessorKey: 'currentPosition',
    header: 'Current Title',
    enableSorting: false,
    cell: ({ row }) => <MutedCell value={row.original.currentPosition} className="block truncate" />,
  },
  {
    accessorKey: 'currentCompany',
    header: 'Company',
    enableSorting: false,
    cell: ({ row }) => <MutedCell value={row.original.currentCompany} className="block truncate" />,
  },
  {
    accessorKey: 'city',
    header: 'Location',
    enableSorting: false,
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
    enableSorting: false,
    size: 110,
    meta: { align: 'center' },
    cell: ({ row }) => <CandidateStatusCell candidate={row.original} />,
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
  {
    accessorKey: 'salaryExpectation',
    header: 'Expected',
    enableSorting: false,
    size: 130,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <span title={row.original.salaryExpectation || undefined} className="block truncate tabular-nums">
        {row.original.salaryExpectation || '—'}
      </span>
    ),
  },
];
