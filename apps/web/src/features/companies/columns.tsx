'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { type ClientStatus, type Company, clientStatusLabels } from './schema';

export const statusVariant: Record<ClientStatus, 'info' | 'warning' | 'success'> = {
  COLD: 'info',
  WARM: 'warning',
  TRADED: 'success',
};

export const tobVariant: Record<'true' | 'false', 'success' | 'muted'> = {
  true: 'success',
  false: 'muted',
};

interface CompanyColumnsOptions {
  /** Resolves a consultantId to a display name (client-side join — the API returns IDs only). */
  consultantName: (id: string | null) => string;
}

export function getCompanyColumns({ consultantName }: CompanyColumnsOptions): ColumnDef<Company>[] {
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
      size: 140,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>
          {clientStatusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'tobSigned',
      header: 'TOB',
      size: 120,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <Badge variant={tobVariant[String(row.original.tobSigned) as 'true' | 'false']}>
          {row.original.tobSigned ? 'Signed' : 'Not signed'}
        </Badge>
      ),
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
      size: 160,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{consultantName(row.original.consultantId)}</span>
      ),
    },
  ];
}
