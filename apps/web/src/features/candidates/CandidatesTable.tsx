'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { keepPreviousData } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  DataGrid,
  type DataGridFilter,
  type DataGridQuery,
} from '@/components/DataGrid';
import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';
import type {
  GetCandidatesParams,
  GetCandidatesSortBy,
  GetCandidatesStatus,
} from '@/lib/api/generated/types';
import {
  candidateStatuses,
  candidateStatusLabels,
  candidateStatusVariants,
} from './schema';
import { candidateColumns } from './columns';

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
  variant: candidateStatusVariants[value],
}));

const candidateFilters: DataGridFilter[] = [
  // single: the API takes one status value (or ALL).
  { columnId: 'status', title: 'Status', options: statusOptions, single: true },
];

const PAGE_SIZE = 20;

export function CandidatesTable() {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState<
    Pick<GetCandidatesParams, 'q' | 'status' | 'sortBy' | 'sortOrder'>
  >({});
  const { data, isLoading, isError, error } = useGetCandidates(
    { page, pageSize: PAGE_SIZE, ...query },
    // Keep the previous page's rows while the next one loads (no flash).
    { query: { placeholderData: keepPreviousData } },
  );

  // customFetch throws on non-2xx, so a resolved query is always the 200
  // envelope; the guard is for TypeScript's discriminated union.
  const result = data?.status === 200 ? data.data : undefined;
  const candidates = result?.data ?? [];

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const statusFilter =
      (columnFilters.find((f) => f.id === 'status')?.value as
        | string[]
        | undefined) ?? [];
    const sort = sorting[0];
    setQuery({
      q: search.trim() || undefined,
      status: statusFilter.length === 1 ? (statusFilter[0] as GetCandidatesStatus) : undefined,
      sortBy: sort ? (sort.id as GetCandidatesSortBy) : undefined,
      sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    });
    setPage(1);
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load candidates: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <DataGrid
      columns={candidateColumns}
      data={candidates}
      isLoading={isLoading}
      searchPlaceholder="Search candidates…"
      filters={candidateFilters}
      onRowClick={(candidate) => router.push(`/candidates/${candidate.displayId}`)}
      server={{
        total: result?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
        pageCount: result?.pageCount ?? 1,
        onPageChange: setPage,
        onQueryChange: handleQueryChange,
      }}
      emptyState="No candidates yet. Add one to start building your pipeline."
      toolbar={
        <Button size="lg">
          <Plus />
          Add candidate
        </Button>
      }
    />
  );
}
