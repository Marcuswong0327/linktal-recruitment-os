'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowUpRight, Check, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CandidateEntity } from '@/lib/api/generated/types';
import { CandidatesCell, rosterCellLabel } from './CandidatesCell';
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

const numberFormatter = new Intl.NumberFormat('en-SG');
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

function formatSalary(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return '—';
  const prefix = currency ? `${currency} ` : '';
  if (min != null && max != null) {
    return `${prefix}${numberFormatter.format(min)} – ${numberFormatter.format(max)}`;
  }
  return `${prefix}${numberFormatter.format((min ?? max)!)}`;
}

function formatDate(iso: string | null | undefined) {
  return iso ? dateFormatter.format(new Date(iso)) : '—';
}

/** Read-only Yes/No pill for the Replacement?/Collaborated? columns — set from the dedicated Job Order page, not the main sheet. */
function BooleanFlagCell({ value }: { value: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        value ? 'text-foreground' : 'text-muted-foreground/60',
      )}
    >
      {value ? <Check className="size-3.5 text-success" /> : <X className="size-3.5" />}
      {value ? 'Yes' : 'No'}
    </span>
  );
}

interface JobOrderColumnsOptions {
  /** Resolves a clientId to a display name (client-side join — the API returns IDs only). */
  clientName: (id: string) => string;
  /** Resolves a consultantId to a display name — same client-side join as clientName. */
  consultantName: (id: string | null) => string;
  /** Full candidate roster for the Candidates column's multi-select picker. */
  candidates: CandidateEntity[];
}

export function getJobOrderColumns({
  clientName,
  consultantName,
  candidates,
}: JobOrderColumnsOptions): ColumnDef<JobOrder>[] {
  return [
    {
      accessorKey: 'jobTitle',
      header: 'Role',
      enableSorting: false,
      size: 170,
      cell: ({ row }) => (
        <Link
          href={`/job-orders/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          title={`${row.original.jobTitle} — opens its own page`}
          className="flex items-center gap-1 truncate font-medium text-foreground hover:underline"
        >
          <span className="truncate">{row.original.jobTitle}</span>
          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
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
      accessorKey: 'city',
      header: 'City',
      enableSorting: false,
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.city ?? '—'}</span>,
    },
    {
      accessorKey: 'suburb',
      header: 'Suburb',
      enableSorting: false,
      size: 130,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.suburb ?? '—'}</span>,
    },
    {
      id: 'jobCreatedDate',
      header: 'Job Created Date',
      size: 110,
      accessorFn: (row) => row.receivedAt,
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.receivedAt)}</span>,
    },
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
      accessorKey: 'priorityLevel',
      header: 'Priority',
      enableSorting: false,
      size: 110,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const priority = row.original.priorityLevel;
        return (
          <Badge variant={priority != null ? priorityVariant[priority] : 'muted'}>
            {priority != null ? priorityLabels[priority] : 'Not set'}
          </Badge>
        );
      },
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
      meta: { align: 'center' },
      cell: ({ row }) => <span>{consultantName(row.original.consultantId)}</span>,
    },
    {
      id: 'candidates',
      header: 'Candidates',
      enableSorting: false,
      size: 190,
      meta: { strictMinSize: true },
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <CandidatesCell jobOrder={row.original} candidates={candidates} />
          </div>
          <PipelineSheetTrigger jobOrder={row.original} />
        </div>
      ),
    },
    {
      id: 'candidateSubmitted',
      header: 'Candidate Submitted',
      enableSorting: false,
      size: 150,
      cell: ({ row }) => {
        const names = row.original.pipelineSubmissions
          .filter((c) => c.status === 'SUBMITTED')
          .map((c) => c.candidateName);
        return <span className="text-muted-foreground">{rosterCellLabel(names)}</span>;
      },
    },
    {
      id: 'candidatePlaced',
      header: 'Candidate Placed',
      enableSorting: false,
      size: 150,
      cell: ({ row }) => {
        const names = row.original.pipelineSubmissions
          .filter((c) => c.status === 'PLACED')
          .map((c) => c.candidateName);
        return <span className="text-muted-foreground">{rosterCellLabel(names)}</span>;
      },
    },
    {
      id: 'placementStartDate',
      header: 'Placement Starting Date',
      size: 140,
      accessorFn: (row) => row.pipelineSubmissions.find((c) => c.placementStartDate)?.placementStartDate ?? null,
      cell: ({ row }) => {
        const date = row.original.pipelineSubmissions.find((c) => c.placementStartDate)?.placementStartDate ?? null;
        return <span className="whitespace-nowrap">{formatDate(date)}</span>;
      },
    },
    {
      id: 'salaryOffered',
      header: 'Salary Offered',
      size: 120,
      accessorFn: (row) => row.pipelineSubmissions.find((c) => c.placementBaseSalary != null)?.placementBaseSalary ?? 0,
      cell: ({ row }) => {
        const salary = row.original.pipelineSubmissions.find((c) => c.placementBaseSalary != null)?.placementBaseSalary;
        return <span className="tabular-nums whitespace-nowrap">{salary != null ? numberFormatter.format(salary) : '—'}</span>;
      },
    },
    {
      id: 'feeValue',
      header: 'Fee Value',
      size: 120,
      accessorFn: (row) => row.pipelineSubmissions.find((c) => c.placementFeeValue != null)?.placementFeeValue ?? 0,
      cell: ({ row }) => {
        const fee = row.original.pipelineSubmissions.find((c) => c.placementFeeValue != null)?.placementFeeValue;
        return <span className="tabular-nums whitespace-nowrap">{fee != null ? numberFormatter.format(fee) : '—'}</span>;
      },
    },
    {
      accessorKey: 'isReplacement',
      header: 'Replacement?',
      enableSorting: false,
      size: 110,
      meta: { align: 'center' },
      cell: ({ row }) => <BooleanFlagCell value={row.original.isReplacement} />,
    },
    {
      accessorKey: 'isCollaborated',
      header: 'Collaborated?',
      enableSorting: false,
      size: 110,
      meta: { align: 'center' },
      cell: ({ row }) => <BooleanFlagCell value={row.original.isCollaborated} />,
    },
    {
      id: 'latestSubmissionDate',
      header: 'Latest Submission Date',
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
      id: 'interviewDate',
      header: 'Interview Date',
      size: 120,
      accessorFn: (row) =>
        row.pipelineSubmissions.reduce<string | null>(
          (latest, s) =>
            s.latestInterviewDate && (!latest || s.latestInterviewDate > latest) ? s.latestInterviewDate : latest,
          null,
        ),
      cell: ({ row }) => {
        const latest = row.original.pipelineSubmissions.reduce<string | null>(
          (acc, s) =>
            s.latestInterviewDate && (!acc || s.latestInterviewDate > acc) ? s.latestInterviewDate : acc,
          null,
        );
        return <span className="whitespace-nowrap">{formatDate(latest)}</span>;
      },
    },
  ];
}
