'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { DataGrid, type DataGridQuery } from '@/components/DataGrid';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { useGetAuditLogs } from '@/lib/api/generated/audit/audit';
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
  sortBy?: GetAuditLogsSortBy;
  sortOrder?: GetAuditLogsParams['sortOrder'];
}

export function ActivityTable() {
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditLog | null>(null);
  const [filters, setFilters] = React.useState<Filters>({});

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  const { data, isLoading, isFetching, isError, error } = useGetAuditLogs(
    { page, pageSize: PAGE_SIZE, ...filters },
    { query: { placeholderData: keepPreviousData } },
  );

  const result = data?.status === 200 ? data.data : undefined;
  const logs = result?.data ?? [];
  const hasActiveFilters = Boolean(
    filters.action || filters.entityType || filters.actorId || filters.from || filters.to,
  );

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleQueryChange({ sorting }: DataGridQuery) {
    const sort = sorting[0];
    setFilters((prev) => ({
      ...prev,
      sortBy: sort ? (sort.id as GetAuditLogsSortBy) : undefined,
      sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    }));
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
          selected={filters.action ? [filters.action] : []}
          onChange={(values) => set('action', values[0] as GetAuditLogsAction | undefined)}
        />
        <DataGridFacetedFilter
          title="Record type"
          single
          options={entityTypeOptions}
          selected={filters.entityType ? [filters.entityType] : []}
          onChange={(values) => set('entityType', values[0])}
        />
        <ActorFilter consultants={consultants} value={filters.actorId} onValueChange={(v) => set('actorId', v)} />
        <DateRangeFilter
          title="When"
          from={filters.from}
          to={filters.to}
          onChange={({ from, to }) => {
            setFilters((prev) => ({ ...prev, from, to }));
            setPage(1);
          }}
        />
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              setFilters({});
              setPage(1);
            }}
            className="ml-auto text-sm text-muted-foreground hover:text-destructive"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <DataGrid
        columns={auditColumns}
        data={logs}
        isLoading={isLoading}
        isFetching={isFetching}
        hideSearch
        onRowClick={setSelected}
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
        }}
        emptyState={
          hasActiveFilters ? 'No activity matches these filters.' : 'No activity recorded yet.'
        }
      />
      <ActivityDetail entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
