'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { CandidateStatusCell } from './StatusCell';
import { candidateFullName, type Candidate } from './schema';

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
    id: 'fullName',
    // No single "fullName" column server-side to sort by — firstName/
    // lastName are separate CandidateSortField values.
    header: 'Name',
    enableSorting: false,
    cell: ({ row }) => {
      const name = candidateFullName(row.original) || 'Unnamed candidate';
      return (
        <Link
          href={`/candidates/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          title={name}
          className="block truncate font-medium text-foreground hover:underline"
        >
          {name}
        </Link>
      );
    },
  },
  {
    accessorKey: 'currentRole',
    header: 'Current Title',
    enableSorting: false,
    cell: ({ row }) => <MutedCell value={row.original.currentRole} className="block truncate" />,
  },
  {
    accessorKey: 'currentCompany',
    header: 'Company',
    enableSorting: false,
    cell: ({ row }) => <MutedCell value={row.original.currentCompany} className="block truncate" />,
  },
  {
    accessorKey: 'location',
    header: 'Location',
    enableSorting: false,
    size: 170,
    cell: ({ row }) => <MutedCell value={row.original.location} className="block truncate" />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    size: 110,
    meta: { align: 'center' },
    cell: ({ row }) => <CandidateStatusCell candidate={row.original} />,
  },
];
