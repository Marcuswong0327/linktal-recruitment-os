'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { LogContactSheet, type LogContactValues } from '@/components/LogContactSheet';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import {
  getGetStakeholdersQueryKey,
  updateStakeholder as updateStakeholderRequest,
  useAddStakeholderContactHistory,
  useGetStakeholders,
} from '@/lib/api/generated/stakeholders/stakeholders';
import {
  getGetStakeholderRoleTypesQueryKey,
  useCreateStakeholderRoleType,
  useGetStakeholderRoleTypes,
} from '@/lib/api/generated/stakeholder-role-types/stakeholder-role-types';
import { getGetClientsQueryKey } from '@/lib/api/generated/clients/clients';
import {
  GetStakeholdersSortBy,
  GetStakeholdersSortOrder,
  type CreateStakeholderContactHistoryDto,
  type UpdateStakeholderDto,
} from '@/lib/api/generated/types';
import { getStakeholderColumns } from './columns';
import { exportStakeholdersToExcel } from './exportToExcel';
import type { EnrichedStakeholder } from './schema';

const PAGE_SIZE = 20;

export function StakeholderWorkspace({ clientIds }: { clientIds: string[] }) {
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [roleTypeIds, setRoleTypeIds] = React.useState<string[] | undefined>();
  // Default: most-recently-contacted first — the whole point of this
  // workspace is triaging who to reach out to next.
  const [sortBy, setSortBy] = React.useState<GetStakeholdersSortBy | undefined>(
    GetStakeholdersSortBy.lastContactedAt,
  );
  const [sortOrder, setSortOrder] = React.useState<GetStakeholdersSortOrder>(
    GetStakeholdersSortOrder.desc,
  );
  const [selected, setSelected] = React.useState<EnrichedStakeholder[]>([]);
  const [pendingRowId, setPendingRowId] = React.useState<string | null>(null);
  const [loggingContactFor, setLoggingContactFor] = React.useState<EnrichedStakeholder | null>(null);

  const { data, isLoading, isFetching, isError, error } = useGetStakeholders(
    { clientIds, page, pageSize: PAGE_SIZE, q: search, roleTypeIds, sortBy, sortOrder },
    { query: { placeholderData: keepPreviousData } },
  );
  const result = data?.status === 200 ? data.data : undefined;
  const stakeholders = result?.data ?? [];

  const { data: roleTypeData } = useGetStakeholderRoleTypes();
  const roleTypeRows = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const roleTypeOptions = React.useMemo(
    () => roleTypeRows.map((r) => ({ id: r.id, name: r.name })),
    [roleTypeRows],
  );

  const stakeholderFilters: DataGridFilter[] = React.useMemo(
    () => [
      {
        columnId: 'roleType',
        title: 'Role type',
        options: roleTypeRows.map((r) => ({ value: r.id, label: r.name })),
      },
    ],
    [roleTypeRows],
  );

  const createRoleType = useCreateStakeholderRoleType({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getGetStakeholderRoleTypesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add role type'),
    },
  });
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    return res.data;
  }

  const handleRoleTypeChange = React.useCallback(
    async (stakeholder: EnrichedStakeholder, roleTypeId: string) => {
      setPendingRowId(stakeholder.id);
      try {
        await updateStakeholderRequest(stakeholder.id, {
          roleTypeId: roleTypeId || null,
        } as unknown as UpdateStakeholderDto);
        queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
        toast.success('Role type updated');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update role type');
      } finally {
        setPendingRowId(null);
      }
    },
    [queryClient],
  );

  const addContactHistory = useAddStakeholderContactHistory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
        // The backend also bumps the stakeholder's client's lastContactedAt
        // — invalidate the Companies list too so it doesn't show stale data.
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        toast.success('Contact logged');
        setLoggingContactFor(null);
      },
      onError: (err) => toast.error(err.message || 'Failed to log contact'),
    },
  });

  function handleLogContact(values: LogContactValues) {
    if (!loggingContactFor) return;
    // Generated DTO has `notes` as optional (undefined), not nullable — the
    // sheet emits `null` for "cleared", so build the payload without the
    // key entirely rather than sending an invalid `null`.
    addContactHistory.mutate({
      id: loggingContactFor.id,
      data: {
        contactType: values.contactType,
        contactedAt: values.contactedAt,
        ...(values.notes ? { notes: values.notes } : {}),
      } as unknown as CreateStakeholderContactHistoryDto,
    });
  }

  const columns = React.useMemo(
    () =>
      getStakeholderColumns({
        roleTypes: roleTypeOptions,
        onRoleTypeChange: handleRoleTypeChange,
        onCreateRoleType: handleCreateRoleType,
        onLogContact: setLoggingContactFor,
        pendingRowId,
      }),
    [roleTypeOptions, handleRoleTypeChange, pendingRowId],
  );

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const roleTypeFilter = columnFilters.find((f) => f.id === 'roleType')?.value as
      string[] | undefined;
    const sort = sorting[0];
    const sortField = sort && sort.id in GetStakeholdersSortBy ? (sort.id as GetStakeholdersSortBy) : undefined;
    setSearch(search.trim() || undefined);
    setRoleTypeIds(roleTypeFilter);
    setSortBy(sortField);
    setSortOrder(sort?.desc ? GetStakeholdersSortOrder.desc : GetStakeholdersSortOrder.asc);
    setPage(1);
  }

  function handleExport() {
    exportStakeholdersToExcel(selected.length > 0 ? selected : stakeholders);
  }

  if (isError) {
    return (
      <PageLayout>
        <p className="text-sm text-destructive">
          Failed to load stakeholders: {error?.message ?? 'Unknown error'}
        </p>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/companies" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to Companies
        </Button>
        <PageHeader
          title="Stakeholder Enrichment Workspace"
          description="Every contact across the companies you selected — filter, sort, and export before reaching out."
        />
      </div>

      <DataGrid
        columns={columns}
        data={stakeholders}
        isLoading={isLoading}
        isFetching={isFetching}
        searchPlaceholder="Search stakeholders"
        filters={stakeholderFilters}
        emptyState="No stakeholders found for the selected companies."
        getRowId={(s) => s.id}
        onSelectionChange={setSelected}
        enableRowRangeSelect
        toolbar={
          <Button
            size="lg"
            variant="outline"
            disabled={selected.length === 0}
            title={selected.length === 0 ? 'Select rows to export' : undefined}
            onClick={handleExport}
          >
            <Download />
            Export to Excel{selected.length > 0 ? ` (${selected.length})` : ''}
          </Button>
        }
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
        }}
      />

      <LogContactSheet
        open={loggingContactFor !== null}
        onOpenChange={(open) => !open && setLoggingContactFor(null)}
        subjectLabel={loggingContactFor?.fullName ?? ''}
        isSaving={addContactHistory.isPending}
        onSave={handleLogContact}
      />
    </PageLayout>
  );
}
