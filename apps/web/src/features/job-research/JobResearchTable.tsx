'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { keepPreviousData } from '@tanstack/react-query';

import { ChevronDown, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenuItem } from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataGrid, type DataGridQuery } from '@/components/DataGrid';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import { downloadFile } from '@/lib/api/fetcher';
import {
  getExportJobResearchByIdsUrl,
  getExportJobResearchUrl,
  useGetJobResearch,
} from '@/lib/api/generated/job-research/job-research';
import { GetJobResearchSortBy } from '@/lib/api/generated/types/getJobResearchSortBy';
import type {
  ExportJobResearchSortBy,
  ExportJobResearchSortOrder,
  ExportJobResearchStatusesItem,
  GetJobResearchSortOrder,
  GetJobResearchStatusesItem,
} from '@/lib/api/generated/types';
import { getJobResearchColumns } from './columns';
import type { JobResearch, JobResearchAppliedFilters } from './schema';

const PAGE_SIZE = 50;

export function JobResearchTable({
  filters,
}: {
  /** Committed from the search gate's action bar — this table has no filter UI of its own. */
  filters: JobResearchAppliedFilters;
}) {
  const [page, setPage] = React.useState(1);
  // Seeded from the gate's "Sort by" selection; a column header click can
  // still override it locally afterward, same as any other DataGrid.
  const [sortBy, setSortBy] = React.useState<GetJobResearchSortBy | undefined>(filters.sortBy);
  const [sortOrder, setSortOrder] = React.useState<GetJobResearchSortOrder>(filters.sortOrder ?? 'desc');
  const [selected, setSelected] = React.useState<JobResearch[]>([]);
  const [isExporting, setIsExporting] = React.useState(false);

  // A new `filters` object only ever arrives from a fresh "View" click in the
  // gate (even an unchanged re-search) — always worth restarting pagination
  // for, and re-seeding sort from whatever "Sort by" now says (any
  // column-header override from the previous search is intentionally dropped).
  React.useEffect(() => {
    setPage(1);
    setSortBy(filters.sortBy);
    setSortOrder(filters.sortOrder ?? 'desc');
  }, [filters]);

  const { data, isLoading, isFetching, isError, error } = useGetJobResearch(
    {
      page,
      pageSize: PAGE_SIZE,
      statuses: filters.statuses as GetJobResearchStatusesItem[] | undefined,
      industryIds: filters.industryIds,
      specializationIds: filters.specializationIds,
      locationIds: filters.locationIds,
      sortBy,
      sortOrder,
    },
    // Keep the previous page's rows while the next one loads — infinite
    // scroll otherwise flashes the whole list back to a loading skeleton
    // every time the sentinel row requests another batch.
    { query: { placeholderData: keepPreviousData } },
  );
  const result = data?.status === 200 ? data.data : undefined;
  const rows = useInfinitePages(result?.data, page, isFetching);

  // Sorting is the only thing the grid itself still reports — search and
  // faceted filters both live in the gate's action bar.
  function handleQueryChange({ sorting }: DataGridQuery) {
    const sort = sorting[0];
    const sortField = sort && sort.id in GetJobResearchSortBy ? (sort.id as GetJobResearchSortBy) : undefined;
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setPage(1);
  }

  // Routes through the server (not an in-browser xlsx build) so formatting
  // stays in one place and scope is re-checked on every export — a selection
  // exports exactly those rows; no selection exports everything matching the
  // current filters, unbounded. Same pattern as CompaniesTable's export.
  async function handleExport() {
    setIsExporting(true);
    // The server has no ambient concept of "the viewer's timezone" — it only
    // ever sees UTC timestamps, so date/time export columns need this sent
    // along explicitly.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (selected.length > 0) {
        await downloadFile(getExportJobResearchByIdsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected.map((r) => r.id), timezone }),
        });
      } else {
        await downloadFile(
          getExportJobResearchUrl({
            statuses: filters.statuses as unknown as ExportJobResearchStatusesItem[] | undefined,
            industryIds: filters.industryIds,
            specializationIds: filters.specializationIds,
            locationIds: filters.locationIds,
            sortBy: sortBy as unknown as ExportJobResearchSortBy | undefined,
            sortOrder: sortOrder as unknown as ExportJobResearchSortOrder,
            timezone,
          }),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  // Placeholder — not wired up to a real backend action yet. Scope (what
  // "enrich" actually looks up/writes) is still being clarified; this just
  // reserves the menu slot so the bulk-actions UI is in place ahead of it.
  function handleEnrichStakeholders() {
    toast.info("Enrich Stakeholders isn't wired up yet — coming soon.");
  }

  const columns = React.useMemo(() => getJobResearchColumns(), []);

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load job orders: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  return (
    <DataGrid
      columns={columns}
      data={rows}
      isLoading={isLoading}
      isFetching={isFetching}
      hideSearch
      emptyState="No job orders match these filters."
      getRowId={(r) => r.id}
      onSelectionChange={setSelected}
      enableRowRangeSelect
      hideSelectColumn
      // This page has an action bar + empty-state chrome above the grid (the
      // search gate), taller in total than a simple single-table page — it
      // should scroll as one normal page, not have the grid stretch to fill
      // leftover viewport height and clip itself internally. See DataGrid's
      // fillHeight doc.
      fillHeight={false}
      toolbar={
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="lg">
                Bulk Actions
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
              <Download />
              {isExporting ? 'Exporting…' : 'Export to Excel'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleEnrichStakeholders}>
              <Sparkles />
              Enrich Stakeholders
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      selectionContextMenu={
        <>
          <ContextMenuItem onClick={handleExport}>
            <Download />
            Export to Excel
          </ContextMenuItem>
          <ContextMenuItem onClick={handleEnrichStakeholders}>
            <Sparkles />
            Enrich Stakeholders
          </ContextMenuItem>
        </>
      }
      server={{
        total: result?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
        pageCount: result?.pageCount ?? 1,
        onPageChange: setPage,
        onQueryChange: handleQueryChange,
        infiniteScroll: true,
        isFetchingNextPage: isFetching && page > 1,
      }}
    />
  );
}
