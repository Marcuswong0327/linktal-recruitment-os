'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Globe } from 'lucide-react';
import Link from 'next/link';

import { SeekIcon } from '@/components/BrandIcons';
import { cityCoverageLabel, formatDate, type JobResearch } from './schema';

export function getJobResearchColumns(): ColumnDef<JobResearch>[] {
  return [
    {
      // id must match GetJobResearchSortBy.location (server-driven sort).
      id: 'location',
      header: 'City Coverage',
      cell: ({ row }) => <span>{cityCoverageLabel(row.original)}</span>,
    },
    {
      accessorKey: 'jobTitle',
      header: 'Job Title',
      // Absorbs leftover width on a wide screen — see DataGridColumnMeta.grow.
      meta: { grow: true },
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.jobTitle ?? '—'}</span>,
    },
    {
      // id must match GetJobResearchSortBy.client — display still uses companyName.
      id: 'client',
      accessorKey: 'companyName',
      header: 'Company',
      cell: ({ row }) =>
        row.original.companyName ? (
          <Link
            href={`/companies/${row.original.clientId}`}
            onClick={(e) => e.stopPropagation()}
            title={`${row.original.companyName} — opens company details`}
            className="hover:underline"
            data-no-row-drag
          >
            {row.original.companyName}
          </Link>
        ) : (
          <span>—</span>
        ),
    },
    {
      accessorKey: 'salaryRange',
      header: 'Salary',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.salaryRange ?? '—'}</span>,
    },
    {
      accessorKey: 'postedDate',
      header: 'Posted Date',
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.postedDate)}</span>,
    },
    {
      id: 'links',
      enableSorting: false,
      header: 'Links',
      cell: ({ row }) => {
        const { seekUrl, permanentUrl } = row.original;
        if (!seekUrl && !permanentUrl) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {seekUrl ? (
              <a
                href={seekUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Seek listing"
                className="text-muted-foreground hover:text-foreground"
              >
                <SeekIcon className="size-3.5" />
              </a>
            ) : null}
            {permanentUrl ? (
              <a
                href={permanentUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Permanent/archived link"
                className="text-muted-foreground hover:text-foreground"
              >
                <Globe className="size-3.5" />
              </a>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'lastContactedAt',
      header: 'Contacted Date',
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.lastContactedAt)}</span>,
    },
  ];
}
