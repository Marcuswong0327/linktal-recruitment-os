'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ConsultantAvatar } from '@/components/ConsultantCombobox';
import { isPipelineDragEnabled } from '@/lib/feature-flags';
import { PipelineSheetTrigger } from './PipelineSheet';
import type { JobOrder } from './schema';
import {
  jobOrderQualityLabels,
  jobOrderStatusLabels,
  priorityLabels,
  priorityVariant,
  qualityVariant,
  statusVariant,
} from './schema';

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

function formatDate(iso: string | null | undefined) {
  return iso ? dateFormatter.format(new Date(iso)) : '—';
}

interface JobOrderColumnsOptions {
  /** Resolves a clientId to a display name (client-side join — the API returns IDs only). */
  clientName: (id: string) => string;
}

export function getJobOrderColumns({ clientName }: JobOrderColumnsOptions): ColumnDef<JobOrder>[] {
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
      // 'priorityLevel' — must exist so JobOrdersTable's header filter for
      // this columnId (see jobOrderFilters) has a real column to attach to;
      // without it, TanStack logs "Column with id 'priorityLevel' does not
      // exist" the moment any filter is applied. Not a GetJobOrdersSortBy
      // field, so unsortable, same as Status/Quality above.
      accessorKey: 'priorityLevel',
      header: 'Priority',
      enableSorting: false,
      size: 100,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const { priorityLevel } = row.original;
        if (priorityLevel == null) return <span className="text-muted-foreground">—</span>;
        return <Badge variant={priorityVariant[priorityLevel]}>{priorityLabels[priorityLevel]}</Badge>;
      },
    },
    {
      accessorKey: 'clientId',
      header: 'Client',
      enableSorting: false,
      cell: ({ row }) => {
        const { clientId } = row.original;
        return (
          <Link
            href={`/companies/${clientId}?from=job-orders`}
            onClick={(e) => e.stopPropagation()}
            title={`${clientName(clientId)} — opens its own page`}
            className="flex min-w-0 items-center gap-1 truncate hover:underline"
            data-no-row-drag
          >
            <span className="truncate">{clientName(clientId)}</span>
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
      // interviewing, or placed) — REJECTED candidates don't count. Adding/
      // removing candidates from the pipeline happens on the job order's own
      // page, not from this cell; the icon here only moves existing
      // candidates between stages. Displayed count is still derived
      // client-side from pipelineSubmissions (always fresh on this response,
      // unlike the denormalized field, which only updates on the next
      // submission mutation) — same number either way barring a race.
      accessorFn: (row) => row.pipelineSubmissions.filter((s) => s.status !== 'REJECTED').length,
      cell: ({ row }) => {
        const count = row.original.pipelineSubmissions.filter((s) => s.status !== 'REJECTED').length;
        return (
          <div className="flex items-center justify-center gap-1">
            <span className="tabular-nums">{count}</span>
            {isPipelineDragEnabled ? <PipelineSheetTrigger jobOrder={row.original} /> : null}
          </div>
        );
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
