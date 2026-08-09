'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

import { ContactMethodsCell } from '@/components/ContactMethodsCell';
import { cn } from '@/lib/utils';
import { CandidateStatusCell } from './StatusCell';
import { candidateFullName, contactRecencyClassName, formatRelativeContact, type Candidate } from './schema';

function MutedCell({ value, className }: { value: string | null; className?: string }) {
  return (
    <span title={value || undefined} className={cn('text-muted-foreground', className)}>
      {value || '—'}
    </span>
  );
}

export const candidateColumns: ColumnDef<Candidate>[] = [
  {
    id: 'fullName',
    // No single "fullName" column server-side to sort by — firstName/
    // lastName are separate CandidateSortField values.
    header: 'Name',
    enableSorting: false,
    size: 190,
    cell: ({ row }) => {
      const name = candidateFullName(row.original) || 'Unnamed candidate';
      return (
        <Link
          href={`/candidates/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          title={name}
          className="flex min-w-0 flex-col"
        >
          <span className="truncate font-medium text-foreground hover:underline">{name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{row.original.displayId}</span>
        </Link>
      );
    },
  },
  {
    accessorKey: 'jobRoleType',
    header: 'Role Type',
    // JobRoleType is categorical/filter-only server-side (see
    // CandidateSortField's doc — sorting by it would just be an arbitrary
    // alphabetical grouping), so there's no sort to wire up here even though
    // it's the best-populated classifier in the dataset.
    enableSorting: false,
    size: 140,
    cell: ({ row }) => <MutedCell value={row.original.jobRoleType} className="block truncate" />,
  },
  {
    id: 'roleAtCompany',
    header: 'Current Title',
    enableSorting: false,
    size: 180,
    // currentRole/currentCompany are only filled on ~23% of candidates —
    // collapses to nothing rather than two mostly-empty columns.
    cell: ({ row }) => {
      const { currentRole, currentCompany } = row.original;
      if (!currentRole && !currentCompany) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="flex min-w-0 flex-col" title={[currentRole, currentCompany].filter(Boolean).join(' @ ')}>
          <span className="truncate">{currentRole || '—'}</span>
          {currentCompany ? <span className="truncate text-xs text-muted-foreground">{currentCompany}</span> : null}
        </span>
      );
    },
  },
  {
    id: 'lastContactedAt',
    header: 'Last Contacted',
    enableSorting: true,
    size: 170,
    cell: ({ row }) => {
      const { lastContactDate, lastContactNotes } = row.original;
      return (
        <span className="flex min-w-0 flex-col" title={lastContactNotes ?? undefined}>
          <span className={cn('text-sm', contactRecencyClassName(lastContactDate))}>
            {formatRelativeContact(lastContactDate)}
          </span>
          {lastContactNotes ? <span className="truncate text-xs text-muted-foreground">{lastContactNotes}</span> : null}
        </span>
      );
    },
  },
  {
    id: 'contact',
    header: 'Contact',
    // Email/Mobile/LinkedIn/Seek aren't independently sortable server-side
    // (see CandidateSortField) — same shape and reasoning as Stakeholders'
    // Contact column (minus Seek, which has no Stakeholder equivalent).
    enableSorting: false,
    size: 140,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <ContactMethodsCell
        email={row.original.email}
        mobile={row.original.mobile}
        linkedinUrl={row.original.linkedinUrl}
        seekUrl={row.original.seekTalentUrl}
      />
    ),
  },
  {
    accessorKey: 'location',
    header: 'Location',
    enableSorting: false,
    size: 130,
    cell: ({ row }) => {
      const { location, locationLevel } = row.original;
      if (!location) return <span className="text-muted-foreground">—</span>;
      // A country/state-level record isn't wrong, just coarser than the norm
      // (most of this dataset is known to CITY level) — flagged so it doesn't
      // read as more precise than it is.
      const coarse = locationLevel === 'COUNTRY' || locationLevel === 'STATE';
      return (
        <span className="flex min-w-0 items-center gap-1 text-muted-foreground" title={location}>
          <span className="truncate">{location}</span>
          {coarse ? <span className="shrink-0 text-[10px] uppercase opacity-70">{locationLevel}</span> : null}
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: true,
    size: 110,
    meta: { align: 'center' },
    cell: ({ row }) => <CandidateStatusCell candidate={row.original} />,
  },
];
