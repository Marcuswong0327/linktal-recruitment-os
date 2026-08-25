'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  // Seeded from the gate's "Sort by" selection; a column header click can
  // still override it locally afterward, same as any other DataGrid.
  const [sortBy, setSortBy] = React.useState<GetJobResearchSortBy | undefined>(filters.sortBy);
  const [sortOrder, setSortOrder] = React.useState<GetJobResearchSortOrder>(filters.sortOrder ?? 'desc');
  const [selected, setSelected] = React.useState<JobResearch[]>([]);
  const [isExporting, setIsExporting] = React.useState(false);

  // Same selection-order tracking as CompaniesTable, and for the same
  // reason: DataGrid reports rows in table order, not click order, but
  // Enrich Stakeholders needs the order rows were actually selected in.
  // Here it's row-selection order, not company order directly — several
  // research rows can share a company, so the enrich handler below dedupes
  // clientIds by first appearance in this order.
  const selectionOrderRef = React.useRef<string[]>([]);
  function handleSelectionChange(rows: JobResearch[]) {
    const ids = new Set(rows.map((r) => r.id));
    selectionOrderRef.current = selectionOrderRef.current.filter((id) => ids.has(id));
    for (const row of rows) if (!selectionOrderRef.current.includes(row.id)) selectionOrderRef.current.push(row.id);
    setSelected(rows);
  }

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
    // A loading toast, not just the isExporting-driven button label — this
    // is triggered from a DropdownMenuItem, and the dropdown closes the
    // instant it's clicked, so a label change on that now-unmounted item is
    // never actually seen. The toast (same `id` as the success/error below,
    // so it morphs in place rather than stacking) is what's actually visible
    // while an unbounded, potentially-slow export is in flight.
    toast.loading('Exporting…', { id: 'export-job-research' });
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
      toast.success('Export ready', { id: 'export-job-research' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: 'export-job-research' });
    } finally {
      setIsExporting(false);
    }
  }

  // Maps selected Job Research rows -> their companies, in selection order,
  // deduped (several research rows can share a client) -> the same
  // StakeholderEnrichmentWorkspace CompaniesTable's Enrich Stakeholders
  // opens, keyed by clientId instead of the research row's own id.
  function handleEnrichStakeholders() {
    const clientIdByRowId = new Map(selected.map((r) => [r.id, r.clientId]));
    const clientIds: string[] = [];
    for (const rowId of selectionOrderRef.current) {
      const clientId = clientIdByRowId.get(rowId);
      if (clientId && !clientIds.includes(clientId)) clientIds.push(clientId);
    }
    router.push(`/stakeholders/enrich?clientIds=${encodeURIComponent(clientIds.join(','))}`);
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
      onSelectionChange={handleSelectionChange}
      enableRowRangeSelect
      hideSelectColumn
      toolbar={
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="lg" disabled={isExporting}>
                {isExporting ? 'Exporting…' : 'Bulk Actions'}
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
              <Download />
              {isExporting ? 'Exporting…' : 'Export to Excel'}
            </DropdownMenuItem>
            {selected.length > 0 ? (
              <DropdownMenuItem onClick={handleEnrichStakeholders}>
                <Sparkles />
                Enrich Stakeholders
              </DropdownMenuItem>
            ) : null}
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
