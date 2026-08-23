'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridQuery } from '@/components/DataGrid';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { downloadFile } from '@/lib/api/fetcher';
import { getExportAuditLogsUrl, useGetAuditLogs } from '@/lib/api/generated/audit/audit';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import type {
  GetAuditLogsAction,
  GetAuditLogsParams,
  GetAuditLogsSortBy,
} from '@/lib/api/generated/types';
import { auditColumns } from './columns';
import { ActivityDetail } from './ActivityDetail';
import { ActorFilter } from './ActorFilter';
import {
  type AuditLog,
  auditActionLabels,
  auditActionVariants,
  auditActions,
  auditEntityTypes,
  entityTypeFilterLabel,
} from './schema';

const PAGE_SIZE = 25;

const actionOptions = auditActions.map((value) => ({
  value,
  label: auditActionLabels[value] ?? value,
  variant: auditActionVariants[value],
}));
const entityTypeOptions = auditEntityTypes.map((value) => ({ value, label: entityTypeFilterLabel(value) }));

interface Filters {
  action?: GetAuditLogsAction;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

export function ActivityTable() {
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditLog | null>(null);
  // Draft is what the filter controls show; applied is what actually drives
  // the query. They're split so picking filters doesn't search until "View
  // Activity" is clicked — same idea as Companies' search-gate action bar,
  // just without an empty-state gate before the first search.
  const [draftFilters, setDraftFilters] = React.useState<Filters>({});
  const [appliedFilters, setAppliedFilters] = React.useState<Filters>({});
  // Column-header sort is a separate affordance from the filter pills above
  // — it applies immediately on click, same as every other DataGrid page.
  const [sortBy, setSortBy] = React.useState<GetAuditLogsSortBy | undefined>();
  const [sortOrder, setSortOrder] = React.useState<GetAuditLogsParams['sortOrder']>();
  const [isExporting, setIsExporting] = React.useState(false);

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  const { data, isLoading, isFetching, isError, error } = useGetAuditLogs(
    { page, pageSize: PAGE_SIZE, ...appliedFilters, sortBy, sortOrder },
    { query: { placeholderData: keepPreviousData } },
  );

  const result = data?.status === 200 ? data.data : undefined;
  const logs = result?.data ?? [];
  const hasDraftFilters = Boolean(
    draftFilters.action || draftFilters.entityType || draftFilters.actorId || draftFilters.from || draftFilters.to,
  );
  const hasAppliedFilters = Boolean(
    appliedFilters.action ||
      appliedFilters.entityType ||
      appliedFilters.actorId ||
      appliedFilters.from ||
      appliedFilters.to,
  );

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleQueryChange({ sorting }: DataGridQuery) {
    const sort = sorting[0];
    setSortBy(sort ? (sort.id as GetAuditLogsSortBy) : undefined);
    setSortOrder(sort ? (sort.desc ? 'desc' : 'asc') : undefined);
  }

  // Routes through the server (not an in-browser build) so formatting stays
  // in one place and every export is logged — mirrors JobOrdersTable/
  // CompaniesTable's handleExport. Every row matching the currently applied
  // filters, unbounded — no row selection on this page.
  async function handleExport() {
    setIsExporting(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await downloadFile(getExportAuditLogsUrl({ ...appliedFilters, sortBy, sortOrder, timezone }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load activity: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        <DataGridFacetedFilter
          title="Action"
          single
          options={actionOptions}
          selected={draftFilters.action ? [draftFilters.action] : []}
          onChange={(values) => set('action', values[0] as GetAuditLogsAction | undefined)}
        />
        <DataGridFacetedFilter
          title="Record type"
          single
          options={entityTypeOptions}
          selected={draftFilters.entityType ? [draftFilters.entityType] : []}
          onChange={(values) => set('entityType', values[0])}
        />
        <ActorFilter consultants={consultants} value={draftFilters.actorId} onValueChange={(v) => set('actorId', v)} />
        <DateRangeFilter
          title="When"
          from={draftFilters.from}
          to={draftFilters.to}
          onChange={({ from, to }) => setDraftFilters((prev) => ({ ...prev, from, to }))}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!hasDraftFilters && !hasAppliedFilters}
            onClick={() => {
              setDraftFilters({});
              setAppliedFilters({});
              setPage(1);
            }}
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              setAppliedFilters(draftFilters);
              setPage(1);
            }}
            disabled={isFetching}
          >
            View Activity
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            <Download />
            {isExporting ? 'Exporting…' : 'Bulk Export'}
          </Button>
        </div>
      </div>

      <DataGrid
        columns={auditColumns}
        data={logs}
        isLoading={isLoading}
        isFetching={isFetching}
        hideSearch
        onRowClick={setSelected}
        // This page has a filter bar + action-button row above the grid
        // (like Companies' search gate) — size to actual content instead of
        // stretching to fill leftover viewport height. See DataGrid's
        // fillHeight doc.
        fillHeight={false}
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
        }}
        emptyState={
          hasAppliedFilters ? 'No activity matches these filters.' : 'No activity recorded yet.'
        }
      />
      <ActivityDetail entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
