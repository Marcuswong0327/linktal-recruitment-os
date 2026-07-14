'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { useGetAuditLogs } from '@/lib/api/generated/audit/audit';
import type {
  GetAuditLogsAction,
  GetAuditLogsParams,
  GetAuditLogsSortBy,
} from '@/lib/api/generated/types';
import { auditColumns } from './columns';
import { ActivityDetail } from './ActivityDetail';
import {
  type AuditLog,
  auditActionLabels,
  auditActionVariants,
  auditActions,
  auditEntityTypes,
} from './schema';

const PAGE_SIZE = 25;

const activityFilters: DataGridFilter[] = [
  {
    columnId: 'action',
    title: 'Action',
    single: true,
    options: auditActions.map((value) => ({
      value,
      label: auditActionLabels[value] ?? value,
      variant: auditActionVariants[value],
    })),
  },
  {
    columnId: 'entityType',
    title: 'Entity',
    single: true,
    options: auditEntityTypes.map((value) => ({ value, label: value })),
  },
];

export function ActivityTable() {
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditLog | null>(null);
  const [query, setQuery] = React.useState<
    Pick<GetAuditLogsParams, 'action' | 'entityType' | 'sortBy' | 'sortOrder'>
  >({});

  const { data, isLoading, isFetching, isError, error } = useGetAuditLogs(
    { page, pageSize: PAGE_SIZE, ...query },
    { query: { placeholderData: keepPreviousData } },
  );

  const result = data?.status === 200 ? data.data : undefined;
  const logs = result?.data ?? [];

  function handleQueryChange({ sorting, columnFilters }: DataGridQuery) {
    const pick = (id: string) =>
      (columnFilters.find((f) => f.id === id)?.value as string[] | undefined)?.[0];
    const sort = sorting[0];
    setQuery({
      action: pick('action') as GetAuditLogsAction | undefined,
      entityType: pick('entityType'),
      sortBy: sort ? (sort.id as GetAuditLogsSortBy) : undefined,
      sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    });
    setPage(1);
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
      <DataGrid
        columns={auditColumns}
        data={logs}
        isLoading={isLoading}
        isFetching={isFetching}
        filters={activityFilters}
        onRowClick={setSelected}
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
        }}
        emptyState="No activity recorded yet."
      />
      <ActivityDetail entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
