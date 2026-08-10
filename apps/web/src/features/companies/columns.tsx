'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ComboboxSelect } from '@/components/ComboboxSelect';
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
  /** Resolves a consultantId to a display name — client-side join, the API returns the id only. */
  consultantName: (id: string | null) => string;
  /** Row id currently saving an inline change — disables that row's controls. */
  pendingRowId: string | null;
  /** Absent when the caller lacks `client:update` — controls render read-only. */
  canUpdate: boolean;
  /**
   * Omits the Consultant column — every row is already scoped to this
   * consultant's own book (see ClientsService.findAll) and the field is
   * redacted server-side too, so the column would just repeat their own name
   * (or nothing) on every row. Same reasoning as Job Orders'
   * hideConsultantColumn.
   */
  hideConsultantColumn?: boolean;
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
      cell: ({ row }) => {
        const client = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {initials(client.companyName)}
            </span>
            <span className="truncate font-medium text-foreground">{client.companyName}</span>
            {client.website ? (
              <a
                href={client.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open ${client.companyName}'s website`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.industry ?? '—'}</span>,
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
    {
      accessorKey: 'lastContactedAt',
      header: 'Last contacted',
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.lastContactedAt)}</span>,
    },
  ];
}
