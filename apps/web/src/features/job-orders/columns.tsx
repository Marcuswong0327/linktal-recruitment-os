'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

import type { ConsultantEntity } from '@/lib/api/generated/types';
import type { JobOrder } from './schema';
import { JobOrderConsultantCell, JobOrderPriorityCell, JobOrderStatusCell } from './StatusCell';

const numberFormatter = new Intl.NumberFormat('en-SG');

function formatSalary(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return '—';
  const prefix = currency ? `${currency} ` : '';
  if (min != null && max != null) {
    return `${prefix}${numberFormatter.format(min)} – ${numberFormatter.format(max)}`;
  }
  return `${prefix}${numberFormatter.format((min ?? max)!)}`;
}

interface JobOrderColumnsOptions {
  /** Resolves a clientId to a display name (client-side join — the API returns IDs only). */
  clientName: (id: string) => string;
  /** Full consultant roster for the inline assignment combobox. */
  consultants: ConsultantEntity[];
}

export function getJobOrderColumns({
  clientName,
  consultants,
}: JobOrderColumnsOptions): ColumnDef<JobOrder>[] {
  return [
    {
      accessorKey: 'jobTitle',
      header: 'Role',
      enableSorting: false,
      size: 150,
      cell: ({ row }) => (
        <Link
          href={`/job-orders/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          title={row.original.jobTitle}
          className="block truncate font-medium text-foreground hover:underline"
        >
          {row.original.jobTitle}
        </Link>
      ),
    },
    {
      accessorKey: 'clientId',
      header: 'Client',
      enableSorting: false,
      cell: ({ row }) => <span>{clientName(row.original.clientId)}</span>,
    },
    {
      accessorKey: 'location',
      header: 'Location',
      enableSorting: false,
      size: 150,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.location ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: false,
      size: 110,
      meta: { align: 'center' },
      cell: ({ row }) => <JobOrderStatusCell jobOrder={row.original} />,
    },
    {
      accessorKey: 'priorityLevel',
      header: 'Priority',
      enableSorting: false,
      size: 110,
      meta: { align: 'center' },
      cell: ({ row }) => <JobOrderPriorityCell jobOrder={row.original} />,
    },
    {
      id: 'salary',
      header: 'Salary Range',
      size: 100,
      accessorFn: (row) => row.salaryMax ?? row.salaryMin ?? 0,
      cell: ({ row }) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatSalary(
            row.original.salaryMin,
            row.original.salaryMax,
            row.original.salaryCurrency,
          )}
        </span>
      ),
    },
    {
      id: 'openings',
      header: 'Filled',
      enableSorting: false,
      size: 100,
      meta: { align: 'center' },
      accessorFn: (row) => row.filledCount,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.filledCount} / {row.original.openings}
        </span>
      ),
    },
    {
      accessorKey: 'consultantId',
      header: 'Consultant',
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => (
        <JobOrderConsultantCell jobOrder={row.original} consultants={consultants} />
      ),
    },
  ];
}
