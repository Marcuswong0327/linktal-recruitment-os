'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { EnumSelect } from '@/components/EnumSelect';
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import type { ConsultantEntity } from '@/lib/api/generated/types';
import { type ClientStatus, type Company, clientStatusLabels, clientStatuses } from './schema';

export const statusVariant: Record<ClientStatus, 'info' | 'warning' | 'success'> = {
  COLD: 'info',
  WARM: 'warning',
  TRADED: 'success',
};

export const tobVariant: Record<'true' | 'false', 'success' | 'muted'> = {
  true: 'success',
  false: 'muted',
};

const statusTriggerClassName: Record<ClientStatus, string> = {
  COLD: 'border-info/30 bg-info/10 text-info',
  WARM: 'border-warning/30 bg-warning/10 text-warning',
  TRADED: 'border-success/30 bg-success/10 text-success',
};

const tobTriggerClassName: Record<'true' | 'false', string> = {
  true: 'border-success/30 bg-success/10 text-success',
  false: 'border-transparent bg-muted text-muted-foreground',
};

const statusOptions = clientStatuses.map((value) => ({
  value,
  label: clientStatusLabels[value],
  triggerClassName: statusTriggerClassName[value],
}));

const tobOptions = [
  { value: 'true', label: 'Signed', triggerClassName: tobTriggerClassName.true },
  { value: 'false', label: 'Not signed', triggerClassName: tobTriggerClassName.false },
];

interface CompanyColumnsOptions {
  consultants: ConsultantEntity[];
  /** Fires on selection — applied immediately, no drawer/save step. */
  onConsultantChange: (company: Company, consultantId: string) => void;
  onStatusChange: (company: Company, status: ClientStatus) => void;
  onTobSignedChange: (company: Company, tobSigned: boolean) => void;
  /** Row id currently saving an inline change — disables that row's pills. */
  pendingRowId: string | null;
}

export function getCompanyColumns({
  consultants,
  onConsultantChange,
  onStatusChange,
  onTobSignedChange,
  pendingRowId,
}: CompanyColumnsOptions): ColumnDef<Company>[] {
  return [
    {
      accessorKey: 'companyName',
      header: 'Company',
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.companyName}</span>
      ),
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.industry ?? '—'}</span>
      ),
    },
    {
      id: 'location',
      header: 'Location',
      accessorFn: (row) => [row.city, row.country].filter(Boolean).join(', '),
      cell: ({ row }) => {
        const location = [row.original.city, row.original.country].filter(Boolean).join(', ');
        return <span className="text-muted-foreground">{location || '—'}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Relationship',
      size: 150,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <EnumSelect
              value={company.status}
              onValueChange={(v) => onStatusChange(company, v as ClientStatus)}
              options={statusOptions}
              disabled={pendingRowId === company.id}
              className="w-fit mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'tobSigned',
      header: 'TOB',
      size: 130,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <EnumSelect
              value={String(company.tobSigned)}
              onValueChange={(v) => onTobSignedChange(company, v === 'true')}
              options={tobOptions}
              disabled={pendingRowId === company.id}
              className="w-fit mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'feePercentage',
      header: 'Fee %',
      size: 100,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.feePercentage != null ? `${row.original.feePercentage}%` : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'consultantId',
      header: 'Consultant',
      size: 170,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
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
    },
  ];
}
