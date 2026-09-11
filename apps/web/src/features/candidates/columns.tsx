'use client';

import type { ColumnDef } from '@tanstack/react-table';

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

// Header sort uses server `manualSorting` — accessorFn only unlocks TanStack
// getCanSort() / column id for API sortBy (same as Stakeholders Name/Role type).
// Specialization is m2m: filter yes, sort omitted (Prisma can't orderBy many-name).
export const candidateColumns: ColumnDef<Candidate>[] = [
  {
    id: 'location',
    accessorFn: (row) => row.location ?? '',
    header: 'City Coverage',
    enableSorting: true,
    size: 150,
    cell: ({ row }) => {
      const { location, locationLevel } = row.original;
      if (!location) return <span className="text-muted-foreground">—</span>;
      // Most candidates are known to City Coverage level; a COUNTRY-level
      // record means the city isn't known yet, not that it's wrong — flagged
      // so it doesn't read as more precise than it is.
      const coarse = locationLevel === 'COUNTRY';
      return (
        <span className="flex min-w-0 items-center gap-1 text-muted-foreground" title={location}>
          <span className="truncate">{location}</span>
          {coarse ? <span className="shrink-0 text-[10px] uppercase opacity-70">Country only</span> : null}
        </span>
      );
    },
  },
  {
    accessorKey: 'jobRoleType',
    header: 'Role Type',
    enableSorting: true,
    size: 140,
    cell: ({ row }) => <MutedCell value={row.original.jobRoleType} className="block truncate" />,
  },
  {
    id: 'specialization',
    accessorFn: (row) => row.specializations.join(', '),
    header: 'Specialization',
    // m2m — filter only; no CandidateSortField / no chevron.
    enableSorting: false,
    size: 170,
    cell: ({ row }) => <LocationBadgeList locations={row.original.specializations} />,
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
    // Email/Mobile/LinkedIn/Seek aren't independently sortable server-side —
    // same shape and reasoning as Stakeholders' Contact column (minus Seek,
    // which has no Stakeholder equivalent). Each button copies its value on
    // click (see ContactMethodsCell).
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
    accessorKey: 'currentSalary',
    header: 'Salary Current',
    // Candidate scalar (filter/sort hit this column). Display may also show
    // contact-history fallbacks via the entity — see CandidateEntity.
    enableSorting: true,
    size: 130,
    cell: ({ row }) => <MutedCell value={row.original.currentSalary} className="block truncate" />,
  },
  {
    accessorKey: 'expectedSalary',
    header: 'Salary Expected',
    enableSorting: true,
    size: 130,
    cell: ({ row }) => <MutedCell value={row.original.expectedSalary} className="block truncate" />,
  },
  {
    id: 'notes',
    header: 'Notes',
    // Resolved from the latest CandidateContactHistory row, not a
    // CandidateSortField — same "denormalized, read-only" shape as
    // lastContactedAt/lastContactedBy below.
    enableSorting: false,
    size: 200,
    // Absorbs leftover width on a wide screen — see DataGridColumnMeta.grow.
    meta: { grow: true },
    cell: ({ row }) => <MutedCell value={row.original.lastContactNotes} className="block truncate" />,
  },
  {
    id: 'lastContactedAt',
    accessorFn: (row) => row.lastContactedAt ?? '',
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
    id: 'lastContactedBy',
    accessorFn: (row) => row.lastContactedBy ?? '',
    header: 'Last Contacted By',
    // Sort maps to denormalized lastContactedById on the API.
    enableSorting: true,
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
];
