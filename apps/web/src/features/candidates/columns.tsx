'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConsultantAvatar } from '@/components/ConsultantCombobox';
import { ContactMethodsCell } from '@/components/ContactMethodsCell';
import { LocationBadgeList } from '@/components/LocationBadgeList';
import { cn } from '@/lib/utils';
import { contactRecencyClassName, formatRelativeContact, type Candidate } from './schema';

function MutedCell({ value, className }: { value: string | null; className?: string }) {
  return (
    <span title={value || undefined} className={cn('text-muted-foreground', className)}>
      {value || '—'}
    </span>
  );
}

export const candidateColumns: ColumnDef<Candidate>[] = [
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
    id: 'specialization',
    header: 'Specialization',
    // Not a CandidateSortField — same reasoning as Role Type. Only tagged
    // on ~5% of candidates (see CLAUDE.md), so "—" is the common case.
    enableSorting: false,
    size: 170,
    cell: ({ row }) => <LocationBadgeList locations={row.original.specializations} />,
  },
  {
    accessorKey: 'location',
    header: 'Suburb',
    enableSorting: false,
    size: 130,
    cell: ({ row }) => {
      const { location, locationLevel } = row.original;
      if (!location) return <span className="text-muted-foreground">—</span>;
      // A country/state-level record isn't wrong, just coarser than the norm
      // (most of this dataset is known to CITY level) — flagged so it doesn't
      // read as more precise than "Suburb" implies.
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
    accessorKey: 'firstName',
    header: 'First Name',
    enableSorting: true,
    size: 130,
    cell: ({ row }) => (
      <span className="truncate font-medium text-foreground" title={row.original.firstName ?? undefined}>
        {row.original.firstName || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'lastName',
    header: 'Family Name',
    enableSorting: true,
    size: 130,
    cell: ({ row }) => (
      <span className="truncate font-medium text-foreground" title={row.original.lastName ?? undefined}>
        {row.original.lastName || '—'}
      </span>
    ),
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
    id: 'notes',
    header: 'Notes',
    // Resolved from the latest CandidateContactHistory row, not a
    // CandidateSortField — same "denormalized, read-only" shape as
    // lastContactedAt/lastContactedBy below.
    enableSorting: false,
    size: 200,
    cell: ({ row }) => <MutedCell value={row.original.lastContactNotes} className="block truncate" />,
  },
  {
    accessorKey: 'currentSalary',
    header: 'Current Salary',
    // Free text, resolved from the latest CandidateContactHistory row (see
    // CandidateEntity.currentSalary) — not a real Candidate column, so not a
    // CandidateSortField and never a filter, same as Notes above.
    enableSorting: false,
    size: 130,
    cell: ({ row }) => <MutedCell value={row.original.currentSalary} className="block truncate" />,
  },
  {
    accessorKey: 'expectedSalary',
    header: 'Expected Salary',
    enableSorting: false,
    size: 130,
    cell: ({ row }) => <MutedCell value={row.original.expectedSalary} className="block truncate" />,
  },
  {
    id: 'lastContactedAt',
    header: 'Last Contacted At',
    enableSorting: true,
    size: 140,
    cell: ({ row }) => (
      <span className={cn('text-sm', contactRecencyClassName(row.original.lastContactDate))}>
        {formatRelativeContact(row.original.lastContactDate)}
      </span>
    ),
  },
  {
    accessorKey: 'lastContactedBy',
    header: 'Last Contacted By',
    // Resolved from the latest CandidateContactHistory row, not a real
    // column on Candidate itself — not a CandidateSortField. Same avatar +
    // name treatment as Stakeholders' equivalent column.
    enableSorting: false,
    size: 160,
    cell: ({ row }) => {
      const { lastContactedById, lastContactedBy } = row.original;
      if (!lastContactedById) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex min-w-0 items-center gap-2">
          <ConsultantAvatar consultantId={lastContactedById} name={lastContactedBy ?? undefined} size={5} />
          <span className="truncate text-muted-foreground">{lastContactedBy ?? 'Unknown'}</span>
        </div>
      );
    },
  },
  {
    id: 'history',
    header: '',
    enableSorting: false,
    size: 56,
    meta: { align: 'center' },
    // No API endpoint lists a candidate's full contact history — only the
    // denormalized "latest contact" fields above. This just opens the
    // candidate detail page, where the notes timeline and work history live.
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          title="View history"
          aria-label="View history"
          render={<Link href={`/candidates/${row.original.id}`} />}
        >
          <History className="text-muted-foreground" />
        </Button>
      </div>
    ),
  },
];
