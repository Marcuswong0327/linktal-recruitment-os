'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

import { EnumSelect } from '@/components/EnumSelect';
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import type { ConsultantEntity } from '@/lib/api/generated/types';
import {
  type ClientQuality,
  type ClientStatus,
  type Company,
  clientQualities,
  clientQualityLabels,
  clientStatusLabels,
  clientStatuses,
} from './schema';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export const statusVariant: Record<ClientStatus, 'info' | 'warning' | 'success'> = {
  COLD: 'info',
  WARM: 'warning',
  TRADED: 'success',
};

export const tobVariant: Record<'true' | 'false', 'success' | 'muted'> = {
  true: 'success',
  false: 'muted',
};

export const statusTriggerClassName: Record<ClientStatus, string> = {
  COLD: 'border-info/30 bg-info/10 text-info',
  WARM: 'border-warning/30 bg-warning/10 text-warning',
  TRADED: 'border-success/30 bg-success/10 text-success',
};

export const tobTriggerClassName: Record<'true' | 'false', string> = {
  true: 'border-success/30 bg-success/10 text-success',
  false: 'border-transparent bg-muted text-muted-foreground',
};

// Ascending scale: muted (low) -> info (medium) -> success (high).
export const qualityVariant: Record<ClientQuality, 'muted' | 'info' | 'success'> = {
  LOW: 'muted',
  MEDIUM: 'info',
  HIGH: 'success',
};

export const qualityTriggerClassName: Record<ClientQuality, string> = {
  LOW: 'border-transparent bg-muted text-muted-foreground',
  MEDIUM: 'border-info/30 bg-info/10 text-info',
  HIGH: 'border-success/30 bg-success/10 text-success',
};

// Single option list per field — `variant` drives Badges/faceted filters,
// `triggerClassName` drives the colored EnumSelect pills (table cell, drawer,
// and detail page all share these instead of each rebuilding their own).
export const statusOptions = clientStatuses.map((value) => ({
  value,
  label: clientStatusLabels[value],
  variant: statusVariant[value],
  triggerClassName: statusTriggerClassName[value],
}));

export const qualityOptions = clientQualities.map((value) => ({
  value,
  label: clientQualityLabels[value],
  variant: qualityVariant[value],
  triggerClassName: qualityTriggerClassName[value],
}));

export const tobOptions = [
  {
    value: 'true',
    label: 'Signed',
    variant: tobVariant.true,
    triggerClassName: tobTriggerClassName.true,
  },
  {
    value: 'false',
    label: 'Not signed',
    variant: tobVariant.false,
    triggerClassName: tobTriggerClassName.false,
  },
];

interface CompanyColumnsOptions {
  consultants: ConsultantEntity[];
  /** Fires on selection — applied immediately, no drawer/save step. */
  onConsultantChange: (company: Company, consultantId: string) => void;
  onStatusChange: (company: Company, status: ClientStatus) => void;
  onQualityChange: (company: Company, quality: ClientQuality) => void;
  onTobSignedChange: (company: Company, tobSigned: boolean) => void;
  /** Row id currently saving an inline change — disables that row's pills. */
  pendingRowId: string | null;
  /**
   * Omits the Consultant column — every row is scoped to this consultant's
   * own companies (see ClientsService.findAll), so the column would just
   * repeat their own name on every row.
   */
  hideConsultantColumn?: boolean;
}

export function getCompanyColumns({
  consultants,
  onConsultantChange,
  onStatusChange,
  onQualityChange,
  onTobSignedChange,
  pendingRowId,
  hideConsultantColumn,
}: CompanyColumnsOptions): ColumnDef<Company>[] {
  return [
    {
      accessorKey: 'displayId',
      header: 'ID',
      meta: { align: 'center' },
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.displayId}</span>
      ),
    },
    {
      accessorKey: 'companyName',
      header: 'Company',
      // Free text — not a valid ClientSortField (see query-clients.dto.ts),
      // so sorting by it would only ever yield an arbitrary alphabetical
      // grouping and the backend rejects it as an unknown sortBy value.
      enableSorting: false,
      cell: ({ row }) => (
        <Link
          href={`/companies/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          data-no-row-drag
          className="font-medium text-foreground hover:underline"
        >
          {row.original.companyName}
        </Link>
      ),
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.industry ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'specialization',
      header: 'Specialization',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.specialization ?? '—'}</span>
      ),
    },
    {
      id: 'location',
      header: 'Location',
      enableSorting: false,
      accessorFn: (row) => [row.city, row.country].filter(Boolean).join(', '),
      cell: ({ row }) => {
        const location = [row.original.city, row.original.country].filter(Boolean).join(', ');
        return <span className="text-muted-foreground">{location || '—'}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Relationship',
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
            <EnumSelect
              value={company.status}
              onValueChange={(v) => onStatusChange(company, v as ClientStatus)}
              options={statusOptions}
              disabled={pendingRowId === company.id}
              size="badge"
              className="w-fit mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'quality',
      header: 'Quality',
      // Unlike status, quality is a meaningfully ordinal enum (Low < Medium <
      // High, matching the DB enum's declaration order), so sorting it is
      // left enabled — see ClientSortField in query-clients.dto.ts.
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
            <EnumSelect
              value={company.quality}
              onValueChange={(v) => onQualityChange(company, v as ClientQuality)}
              options={qualityOptions}
              disabled={pendingRowId === company.id}
              size="badge"
              className="w-fit mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'tobSigned',
      header: 'TOB',
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
            <EnumSelect
              value={String(company.tobSigned)}
              onValueChange={(v) => onTobSignedChange(company, v === 'true')}
              options={tobOptions}
              disabled={pendingRowId === company.id}
              size="badge"
              className="w-fit mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'lastContactedAt',
      header: 'Last contacted',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.lastContactedAt ? formatDate(row.original.lastContactedAt) : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'feePercentage',
      header: 'Fee %',
      meta: { align: 'center' },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.feePercentage != null ? `${row.original.feePercentage}%` : '—'}
        </span>
      ),
    },
    ...(hideConsultantColumn
      ? []
      : [
          {
            accessorKey: 'consultantId',
            header: 'Consultant',
            enableSorting: false,
            meta: { align: 'center', strictMinSize: true },
            cell: ({ row }) => {
              const company = row.original;
              return (
                <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
                  <ConsultantCombobox
                    value={company.consultantId ?? ''}
                    onValueChange={(v) => onConsultantChange(company, v)}
                    consultants={consultants}
                    disabled={pendingRowId === company.id}
                    className="w-fit mx-auto"
                  />
                </div>
              );
            },
          } satisfies ColumnDef<Company>,
        ]),
  ];
}
