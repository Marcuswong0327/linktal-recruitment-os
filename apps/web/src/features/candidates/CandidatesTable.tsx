'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronDown, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContextMenuItem } from '@/components/ui/context-menu';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { DataGrid, type DataGridQuery } from '@/components/DataGrid';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { downloadFile } from '@/lib/api/fetcher';
import {
  deleteCandidate as deleteCandidateRequest,
  getCandidates,
  getExportCandidatesByIdsUrl,
  getExportCandidatesUrl,
  getGetCandidatesQueryKey,
  restoreCandidate as restoreCandidateRequest,
  updateCandidate as updateCandidateRequest,
  useGetCandidates,
} from '@/lib/api/generated/candidates/candidates';
import type { GetCandidatesSortBy, UpdateCandidateDto } from '@/lib/api/generated/types';
import { type Candidate, candidateStatuses, candidateStatusLabels, candidateStatusVariants } from './schema';
import { candidateColumns } from './columns';
import type { useCandidateSearch } from './useCandidateSearch';

// Batch size fetched per infinite-scroll page — no longer user-selectable
// now that there's no "page" to apply it to; just how many rows load per
// scroll-triggered fetch.
const PAGE_SIZE = 50;
// Hard ceiling on "select all matching" — export/bulk-action targets stay
// bounded even if a filter combination is barely narrowed at all (e.g. no
// filters, the full 3,960-row table).
const SELECT_ALL_CAP = 5000;

export function CandidatesTable({
  canCreate = true,
  canDelete = true,
  canUpdate = true,
  search,
}: {
  canCreate?: boolean;
  canDelete?: boolean;
  /** Gates the bulk status menu — calls candidate:update. A read-only role (viewer) sees the row but not the write affordances. */
  canUpdate?: boolean;
  /** Filter/search state lifted into the search-gate parent — shared with its top filter row and Active Filters chips. */
  search: ReturnType<typeof useCandidateSearch>;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [page, setPage] = React.useState(1);
  const [selectedCandidates, setSelectedCandidates] = React.useState<Candidate[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  // Selection is normally page-scoped (see DataGrid's onSelectionChange doc)
  // — this flips on once the user explicitly asks to extend it to every row
  // matching the current filters, not just what's rendered on this page.
  const [selectAllMode, setSelectAllMode] = React.useState(false);
  const [isSelectingAll, setIsSelectingAll] = React.useState(false);

  // The search-gate's filter state is the single source of truth for query
  // params; reset to page 1 whenever it actually changes (queryParams is
  // memoized on `filters`, so this only fires on a real change, not every
  // render).
  React.useEffect(() => setPage(1), [search.queryParams]);

  const { data, isLoading, isFetching, isError, error } = useGetCandidates(
    { page, pageSize: PAGE_SIZE, ...search.queryParams },
    // Keep the previous page's rows while the next one loads (no flash).
    { query: { placeholderData: keepPreviousData } },
  );

  // customFetch throws on non-2xx, so a resolved query is always the 200
  // envelope; the guard is for TypeScript's discriminated union.
  const result = data?.status === 200 ? data.data : undefined;
  const candidates = useInfinitePages(result?.data, page, isFetching);
  const total = result?.total ?? 0;

  function handleSelectionChange(rows: Candidate[]) {
    setSelectedCandidates(rows);
    // Any manual change to the page's own checkboxes (including clearing
    // them) drops out of "every matching row" mode — it's specific to this
    // page's selection again.
    if (selectAllMode) setSelectAllMode(false);
  }

  async function handleSelectAllMatching() {
    setIsSelectingAll(true);
    const capped = Math.min(total, SELECT_ALL_CAP);
    const fetchPageSize = 100;
    const pageCount = Math.ceil(capped / fetchPageSize);
    // Concurrency-limited rather than one request per page — pageSize barely
    // affects latency (measured ~120-140ms regardless of 20 vs 100 rows), so
    // batching a handful of requests in flight at once is the actual lever.
    const CONCURRENCY = 5;
    const all: Candidate[] = [];
    for (let batchStart = 1; batchStart <= pageCount; batchStart += CONCURRENCY) {
      const batch = Array.from({ length: Math.min(CONCURRENCY, pageCount - batchStart + 1) }, (_, i) => batchStart + i);
      const results = await Promise.all(
        batch.map((p) => getCandidates({ page: p, pageSize: fetchPageSize, ...search.queryParams })),
      );
      for (const res of results) {
        if (res.status === 200) all.push(...res.data.data);
      }
    }
    setSelectedCandidates(all.slice(0, capped));
    setSelectAllMode(true);
    setIsSelectingAll(false);
  }

  function handleClearSelection() {
    setSelectedCandidates([]);
    setSelectAllMode(false);
  }

  // Search/status/etc. are driven by the lifted `search` state (and the
  // search-gate's filter row above it), not by DataGrid's built-in search
  // box — this only ever sees column-header sort clicks.
  function handleQueryChange({ sorting }: DataGridQuery) {
    const sort = sorting[0];
    search.set('sortBy', sort ? (sort.id as GetCandidatesSortBy) : undefined);
    search.set('sortOrder', sort ? (sort.desc ? 'desc' : 'asc') : undefined);
  }

  // Bypasses a single-mutation hook (which only tracks one in-flight call at
  // a time) — bulk fires several concurrent requests, and we want a single
  // summary toast, not one per row.
  async function handleBulkUpdate(data: UpdateCandidateDto, actionLabel: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selectedCandidates.map((c) => updateCandidateRequest(c.id, data)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
    if (succeeded > 0) toast.success(`${actionLabel} for ${succeeded} candidate${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed for ${failed} candidate${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    handleClearSelection();
  }

  // Routes through the server (not the old in-browser xlsx build) so
  // formatting stays in one place and scope is re-checked on every export —
  // a selection exports exactly those rows; no selection exports everything
  // matching the current filters, unbounded (not just what's scrolled into
  // view — see the infinite-scroll grid's own doc on why that'd be
  // scroll-position-dependent and not a coherent "export" target).
  async function handleExport() {
    setIsExporting(true);
    // The server has no ambient concept of "the viewer's timezone" — it only
    // ever sees UTC timestamps, so date/time export columns need this sent
    // along explicitly.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (selectedCandidates.length > 0) {
        await downloadFile(getExportCandidatesByIdsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedCandidates.map((c) => c.id), timezone }),
        });
      } else {
        await downloadFile(getExportCandidatesUrl({ ...search.queryParams, timezone }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  function handleBulkDelete() {
    setDeleteConfirmOpen(false);
    const toDelete = selectedCandidates;
    const label = `${toDelete.length} candidate${toDelete.length === 1 ? '' : 's'}`;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
    // Candidate has a real soft-delete/restore endpoint — restore mode:
    // delete fires immediately, Undo calls restore, so it's a genuine
    // reversal rather than a cancelled timer.
    deleteWithUndo({
      label,
      deleteFn: async () => {
        const results = await Promise.allSettled(toDelete.map((c) => deleteCandidateRequest(c.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`Failed to delete ${failed} of ${toDelete.length} candidates`);
      },
      restoreFn: async () => {
        await Promise.allSettled(toDelete.map((c) => restoreCandidateRequest(c.id)));
      },
      onCommitted: invalidate,
      onUndo: invalidate,
    });
    handleClearSelection();
  }

  if (isError) {
    return <p className="text-sm text-destructive">Failed to load candidates: {error?.message ?? 'Unknown error'}</p>;
  }

  const isConsultant = session?.user?.roleName === 'consultant';
  const scopeGrants =
    (session?.user?.industryIds?.length ?? 0) +
    (session?.user?.locationIds?.length ?? 0) +
    (session?.user?.specializationIds?.length ?? 0);
  const allLoadedRowsSelected = selectedCandidates.length > 0 && selectedCandidates.length === candidates.length;

  return (
    <>
      {allLoadedRowsSelected && !selectAllMode && total > candidates.length ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-sm">
          <span>All {candidates.length} loaded so far are selected.</span>
          <button
            type="button"
            onClick={handleSelectAllMatching}
            disabled={isSelectingAll}
            className="font-medium text-primary hover:underline disabled:opacity-60"
          >
            {isSelectingAll
              ? 'Selecting…'
              : `Select all ${Math.min(total, SELECT_ALL_CAP).toLocaleString()} matching${total > SELECT_ALL_CAP ? ` (capped at ${SELECT_ALL_CAP.toLocaleString()})` : ''}`}
          </button>
        </div>
      ) : null}
      {selectAllMode ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-sm">
          <span className="font-medium">
            {selectedCandidates.length.toLocaleString()} candidates selected (every match)
          </span>
          <button type="button" onClick={handleClearSelection} className="text-muted-foreground hover:text-foreground">
            Clear selection
          </button>
        </div>
      ) : null}

      <DataGrid
        columns={candidateColumns}
        data={candidates}
        isLoading={isLoading}
        isFetching={isFetching}
        hideSearch
        onRowClick={(candidate) => router.push(`/candidates/${candidate.id}`)}
        // This page has search bar + filter row + Active Filters chrome
        // above the grid, taller in total than a simple single-table page —
        // it should scroll as one normal page, not have the grid stretch to
        // fill leftover viewport height and clip itself internally. See
        // DataGrid's fillHeight doc.
        fillHeight={false}
        enableRowRangeSelect
        hideSelectColumn
        getRowId={(c) => c.id}
        onSelectionChange={handleSelectionChange}
        server={{
          total,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
          infiniteScroll: true,
          isFetchingNextPage: isFetching && page > 1,
        }}
        emptyState={
          total === 0 && search.hasActiveFilters ? (
            <div className="flex flex-col items-center gap-1.5 py-4 text-center">
              <p className="font-medium">No candidates match these filters.</p>
              {search.filters.specializationIds.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Specialization is only tagged on ~5% of candidates — try removing it from Active Filters above.
                </p>
              ) : isConsultant && scopeGrants === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have any industry, location or specialization grants configured — you&apos;ll only see
                  candidates directly assigned to you until that&apos;s set up.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Try removing a filter from Active Filters above.</p>
              )}
            </div>
          ) : (
            'No candidates yet.'
          )
        }
        toolbar={
          <div className="flex animate-in items-center gap-2 fade-in-0 duration-200">
            <Button size="lg" variant="outline" onClick={handleExport} disabled={isExporting}>
              <Download />
              {isExporting ? 'Exporting…' : 'Export to Excel'}
            </Button>

            {selectedCandidates.length > 0 ? (
              <>
                <Button
                  variant="destructive"
                  size="lg"
                  disabled={!canDelete}
                  title={canDelete ? undefined : "You don't have permission to delete candidates"}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                  Delete
                </Button>
                <ConfirmDeleteDialog
                  open={deleteConfirmOpen}
                  onOpenChange={setDeleteConfirmOpen}
                  title={`Delete ${selectedCandidates.length} candidate${selectedCandidates.length === 1 ? '' : 's'}?`}
                  description="Archived (soft delete) — you can undo this from the toast right after."
                  onConfirm={handleBulkDelete}
                />

                {canUpdate ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="lg" disabled={isBulkUpdating}>
                          {isBulkUpdating ? 'Updating…' : `Bulk actions (${selectedCandidates.length})`}
                          <ChevronDown />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      {candidateStatuses.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => handleBulkUpdate({ status: s }, `Marked ${candidateStatusLabels[s]}`)}
                        >
                          <Badge variant={candidateStatusVariants[s]}>{candidateStatusLabels[s]}</Badge>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </>
            ) : (
              <Button
                size="lg"
                disabled={true}
                title={canCreate ? 'Coming soon' : "You don't have permission to add candidates"}
              >
                Add Candidate
              </Button>
            )}
          </div>
        }
        selectionContextMenu={
          <ContextMenuItem onClick={handleExport}>
            <Download />
            Export to Excel
          </ContextMenuItem>
        }
      />
    </>
  );
}
