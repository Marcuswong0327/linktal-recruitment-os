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

// Last Contacted At is deliberately the only sortable column header — it's
// the one CandidateSortField the recruiter worklist actually triages by
// (see the field's own doc). Role Type/Specialization are categorical
// (sorting would just be an arbitrary alphabetical grouping); Contact/Notes/
// Salary are denormalized or free text with no CandidateSortField at all;
// First/Family Name are sortable server-side (the gate's "Sorted By ->
// Alphabetical" preset uses it) but not exposed as a clickable header, to
// keep exactly one sort affordance in the grid itself.
export const candidateColumns: ColumnDef<Candidate>[] = [
  {
    accessorKey: 'jobRoleType',
    header: 'Role Type',
    enableSorting: false,
    size: 140,
    cell: ({ row }) => <MutedCell value={row.original.jobRoleType} className="block truncate" />,
  },
  {
    id: 'specialization',
    header: 'Specialization',
    // Only tagged on ~5% of candidates (see CLAUDE.md), so "—" is the common case.
    enableSorting: false,
    size: 170,
    cell: ({ row }) => <LocationBadgeList locations={row.original.specializations} />,
  },
  {
    id: 'suburbAndPostcode',
    header: 'Suburb & Postcode',
    enableSorting: false,
    size: 150,
    // Prefers the free-text suburbAndPostcode (e.g. "Merrylands 2160 NSW")
    // once a candidate has one directly edited in; falls back to the
    // resolved City-level `location` (the structured, required locationId)
    // for the majority that don't yet — same precedence as currentSalary/
    // expectedSalary's direct-edit-wins-over-derived pattern.
    cell: ({ row }) => {
      const { suburbAndPostcode, location, locationLevel } = row.original;
      if (suburbAndPostcode) {
        return (
          <span className="truncate text-muted-foreground" title={suburbAndPostcode}>
            {suburbAndPostcode}
          </span>
        );
      }
      if (!location) return <span className="text-muted-foreground">—</span>;
      // A country/state-level record isn't wrong, just coarser than the norm
      // (most of this dataset is known to CITY level) — flagged so it doesn't
      // read as more precise than "Suburb & Postcode" implies.
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
    enableSorting: false,
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
    enableSorting: false,
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
    // Free text, resolved from the latest CandidateContactHistory row (see
    // CandidateEntity.currentSalary) — not a real Candidate column, never
    // sortable or a filter.
    enableSorting: false,
    size: 130,
    cell: ({ row }) => <MutedCell value={row.original.currentSalary} className="block truncate" />,
  },
  {
    accessorKey: 'expectedSalary',
    header: 'Salary Expected',
    enableSorting: false,
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
    // name treatment as Stakeholders'/Companies' equivalent column.
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
];
