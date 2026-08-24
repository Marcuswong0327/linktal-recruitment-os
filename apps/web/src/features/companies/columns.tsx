'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { ComboboxSelect } from '@/components/ComboboxSelect';
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
  /** Row id currently saving an inline change — disables that row's controls. */
  pendingRowId: string | null;
  /** Absent when the caller lacks `client:update` — controls render read-only. */
  canUpdate: boolean;
}

export function getCompanyColumns({
  onStatusChange,
  onQualityChange,
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
            <span className="truncate font-medium text-foreground">{client.companyName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'specialization',
      header: 'Specialization',
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.specialization ?? '—'}</span>,
    },
    {
      id: 'locations',
      header: 'Market',
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
