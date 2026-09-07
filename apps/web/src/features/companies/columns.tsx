'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { ComboboxSelect, type ComboboxSelectOption } from '@/components/ComboboxSelect';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { ConsultantAvatar } from '@/components/ConsultantCombobox';
import { LocationBadgeList } from '@/components/LocationBadgeList';
import { formatDate, qualityOptions, statusOptions, type Company } from './schema';

function initials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface CompanyColumnsOptions {
  onStatusChange: (company: Company, status: string) => void;
  onQualityChange: (company: Company, quality: string) => void;
  onIndustryChange: (company: Company, industryId: string) => void;
  onSpecializationChange: (company: Company, specializationId: string) => void;
  /**
   * Fires when the typed name matches no existing specialization. Returns the
   * created row (so the cell can select it), or null if the user backed out of
   * the industry prompt — see NewSpecializationDialog.
   */
  onCreateSpecialization: (company: Company, name: string) => Promise<CreatableComboboxOption | null>;
  /** Full catalog — 4 rows, so the Industry cell needs no server search. */
  industries: ComboboxSelectOption[];
  /**
   * Server-searched specializations for whichever row is open, keyed by that
   * row's industry — 775 rows is far past what a cell can hold locally.
   */
  specializationOptions: CreatableComboboxOption[];
  onSpecializationQueryChange: (query: string) => void;
  isFetchingSpecializations: boolean;
  /** The row whose Specialization cell is open — drives the scoped fetch above. */
  onSpecializationCellOpen: (company: Company | null) => void;
  /** Absent when the caller lacks `specialization:create` — the cell becomes pick-only. */
  canCreateSpecialization: boolean;
  /** Row id currently saving an inline change — disables that row's controls. */
  pendingRowId: string | null;
  /** Absent when the caller lacks `client:update` — controls render read-only. */
  canUpdate: boolean;
}

export function getCompanyColumns({
  onStatusChange,
  onQualityChange,
  onIndustryChange,
  onSpecializationChange,
  onCreateSpecialization,
  industries,
  specializationOptions,
  onSpecializationQueryChange,
  isFetchingSpecializations,
  onSpecializationCellOpen,
  canCreateSpecialization,
  pendingRowId,
  canUpdate,
}: CompanyColumnsOptions): ColumnDef<Company>[] {
  return [
    {
      id: 'companyName',
      // Not a GetClientsSortBy field — companyName isn't sortable server-side.
      enableSorting: false,
      header: 'Company',
      // Absorbs any leftover width on a wide screen instead of it sitting as
      // dead space past Quality — see DataGridColumnMeta.grow.
      meta: { grow: true },
      cell: ({ row }) => {
        const client = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {initials(client.companyName)}
            </span>
            <span className="truncate font-medium text-foreground group-hover:underline">
              {client.companyName}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      enableSorting: false,
      // Restored (it was dropped in cc484d4 to make room for the two
      // "last contacted" columns) because Specialization can't be edited
      // coherently without it: the picker beside it is scoped to whatever
      // sits here, and Client.industryId is required.
      cell: ({ row }) => {
        const company = row.original;
        if (!canUpdate) {
          return <span className="text-muted-foreground">{company.industry ?? '—'}</span>;
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {/*
              Pick-only, like Status and Quality below: industry is
              admin/manager-only to create, and a brand-new one is held by no
              consultant, so tagging a client with it hides that client from
              all of them (docs/scope-explained.md §3).
            */}
            <ComboboxSelect
              title="Industry"
              value={company.industryId}
              onValueChange={(id) => onIndustryChange(company, id)}
              options={industries}
              disabled={pendingRowId === company.id}
              triggerClassName="mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'specialization',
      header: 'Specialization',
      enableSorting: false,
      cell: ({ row }) => {
        const company = row.original;
        if (!canUpdate) {
          return <span className="text-muted-foreground">{company.specialization ?? '—'}</span>;
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <CreatableCombobox
              title="Specialization"
              variant="badge"
              fullCellHitArea
              value={company.specializationId ?? ''}
              selectedLabel={company.specialization ?? undefined}
              onValueChange={(id) => onSpecializationChange(company, id)}
              options={specializationOptions}
              onQueryChange={(q) => {
                onSpecializationCellOpen(company);
                onSpecializationQueryChange(q);
              }}
              isFetching={isFetchingSpecializations}
              onCreate={
                canCreateSpecialization
                  ? async (name) => {
                      const created = await onCreateSpecialization(company, name);
                      // Cancelling the industry prompt must not commit a value;
                      // CreatableCombobox awaits this, so rejecting leaves the
                      // cell exactly as it was.
                      if (!created) throw new Error('cancelled');
                      return created;
                    }
                  : undefined
              }
              disabled={pendingRowId === company.id}
              placeholder="Uncategorized"
              className="mx-auto"
            />
          </div>
        );
      },
    },
    {
      id: 'locations',
      header: 'City Coverage',
      enableSorting: false,
      cell: ({ row }) => <LocationBadgeList locations={row.original.locations} />,
    },
    {
      accessorKey: 'lastContactedAt',
      header: 'Last contacted',
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.lastContactedAt)}</span>,
    },
    {
      accessorKey: 'lastContactedBy',
      header: 'Last contacted by',
      // Resolved from the latest StakeholderContactHistory row, not a real
      // column on Client itself — not a GetClientsSortBy field. Same avatar +
      // name treatment as Stakeholders'/Candidates' equivalent column.
      enableSorting: false,
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
      accessorKey: 'status',
      header: 'Status',
      // status isn't a GetClientsSortBy field — exposed as a filter instead.
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const client = row.original;
        if (!canUpdate) {
          const current = statusOptions.find((o) => o.value === client.status)!;
          return <Badge className={current.triggerClassName}>{current.label}</Badge>;
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <ComboboxSelect
              title="Status"
              value={client.status}
              onValueChange={(v) => onStatusChange(client, v)}
              options={statusOptions}
              disabled={pendingRowId === client.id}
              triggerClassName="mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'quality',
      header: 'Quality',
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const client = row.original;
        if (!canUpdate) {
          const current = qualityOptions.find((o) => o.value === client.quality)!;
          return <Badge className={current.triggerClassName}>{current.label}</Badge>;
        }
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <ComboboxSelect
              title="Quality"
              value={client.quality}
              onValueChange={(v) => onQualityChange(client, v)}
              options={qualityOptions}
              disabled={pendingRowId === client.id}
              triggerClassName="mx-auto"
            />
          </div>
        );
      },
    },
  ];
}
