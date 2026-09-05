'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ConsultantAvatar } from '@/components/ConsultantCombobox';
import type { JobOrder } from './schema';
import {
  jobOrderQualityLabels,
  jobOrderStatusLabels,
  qualityVariant,
  statusVariant,
} from './schema';

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

function formatDate(iso: string | null | undefined) {
  return iso ? dateFormatter.format(new Date(iso)) : '—';
}

// The API returns clientId only — JobOrdersTable resolves it client-side
// (per-id join) and bakes the result onto each row before handing data to
// DataGrid. It has to live on the row itself rather than be passed in as a
// separate resolver function: DataGrid memoizes its row component keyed off
// `row`/`data` identity (see DataGridBodyRow's doc), so a resolver closure
// that later starts returning a different value for the same clientId never
// forces a re-render — only a changed `row.original` does.
export type JobOrderRow = JobOrder & { clientName: string };

export function getJobOrderColumns(): ColumnDef<JobOrderRow>[] {
  return [
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: false,
      size: 110,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>
          {jobOrderStatusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'quality',
      header: 'Quality',
      enableSorting: false,
      size: 100,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <Badge variant={qualityVariant[row.original.quality]}>
          {jobOrderQualityLabels[row.original.quality]}
        </Badge>
      ),
    },
    {
      accessorKey: 'clientId',
      header: 'Client',
      enableSorting: false,
      cell: ({ row }) => {
        const { clientId, clientName } = row.original;
        return (
          <Link
            href={`/companies/${clientId}?from=job-orders`}
            onClick={(e) => e.stopPropagation()}
            title={`${clientName} — opens its own page`}
            className="flex min-w-0 items-center gap-1 truncate hover:underline"
            data-no-row-drag
          >
            <span className="truncate">{clientName}</span>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
          </Link>
        );
      },
    },
    {
      accessorKey: 'jobTitle',
      header: 'Role',
      size: 170,
      // Absorbs leftover width on a wide screen — see DataGridColumnMeta.grow.
      meta: { grow: true },
      cell: ({ row }) => (
        <Link
          href={`/job-orders/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          title={`${row.original.jobTitle} — opens its own page`}
          className="flex items-center gap-1 truncate font-medium text-foreground hover:underline"
          data-no-row-drag
        >
          <span className="truncate">{row.original.jobTitle}</span>
          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
        </Link>
      ),
    },
    {
      // id must match a real GetJobOrdersSortBy value (this table's sorting
      // is server-driven) — 'activeSubmissionCount' is the denormalized
      // JobOrder field this displays (kept in sync by
      // SubmissionsService.recomputeJobOrderCounters), not a made-up id like
      // the old 'candidatingCount' which the API's strict whitelist
      // (forbidNonWhitelisted) would 400 on.
      id: 'activeSubmissionCount',
      header: 'No. of Candidate-ing',
      size: 150,
      meta: { align: 'center' },
      // "Candidate-ing" = currently active in the pipeline (submitted,
      // interviewing, or placed) — REJECTED candidates don't count. This cell
      // is now a plain read-only count: adding, removing and re-staging
      // candidates all happen on the job order's own page. Derived
      // client-side from pipelineSubmissions (always fresh on this response,
      // unlike the denormalized field, which only updates on the next
      // submission mutation) — same number either way barring a race.
      accessorFn: (row) => row.pipelineSubmissions.filter((s) => s.status !== 'REJECTED').length,
      cell: ({ row }) => {
        const count = row.original.pipelineSubmissions.filter((s) => s.status !== 'REJECTED').length;
        return <span className="tabular-nums">{count}</span>;
      },
    },
    {
      // id must match a real GetJobOrdersSortBy value (this table's sorting
      // is server-driven) — 'receivedAt' is what's actually displayed below,
      // not a made-up id like the old 'createdDate' which the API's strict
      // whitelist (forbidNonWhitelisted) would 400 on.
      id: 'receivedAt',
      header: 'Created Date',
      size: 110,
      accessorFn: (row) => row.receivedAt,
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.receivedAt)}</span>,
    },
    {
      // Same id-must-match-GetJobOrdersSortBy reasoning as the two columns
      // above — 'lastSubmittedAt' is now a real denormalized JobOrder field
      // (see activeSubmissionCount's comment), so this is sortable like any
      // other column instead of the old client-only 'latestSubmission' id.
      id: 'lastSubmittedAt',
      header: 'Latest Submission',
      size: 130,
      accessorFn: (row) =>
        row.pipelineSubmissions.reduce<string | null>(
          (latest, s) => (!latest || s.submittedAt > latest ? s.submittedAt : latest),
          null,
        ),
      cell: ({ row }) => {
        const latest = row.original.pipelineSubmissions.reduce<string | null>(
          (acc, s) => (!acc || s.submittedAt > acc ? s.submittedAt : acc),
          null,
        );
        return <span className="whitespace-nowrap">{formatDate(latest)}</span>;
      },
    },
    {
      id: 'consultants',
      header: 'Consultant',
      enableSorting: false,
      size: 190,
      cell: ({ row }) => {
        const rowConsultants = row.original.consultants;
        if (rowConsultants.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const names = rowConsultants.map((c) => c.name).join(', ');
        return (
          <div className="flex min-w-0 items-center gap-1.5" title={names}>
            <div className="flex shrink-0 -space-x-1.5">
              {rowConsultants.map((c) => (
                <ConsultantAvatar key={c.id} consultantId={c.id} name={c.name} size={5} />
              ))}
            </div>
            <span className="truncate">{names}</span>
          </div>
        );
      },
    },
  ];
}
