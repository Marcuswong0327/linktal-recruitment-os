'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { CheckCheck, ChevronDown, Download, MapPin, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import {
  DataGrid,
  focusNewRowStart,
  type DataGridFilter,
  type DataGridQuery,
} from '@/components/DataGrid';
import { LEVEL_LABEL, LocationFilterButton } from '@/components/LocationMultiSelect';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { downloadFile } from '@/lib/api/fetcher';
import { useCreateJobTitle } from '@/lib/api/generated/job-titles/job-titles';
import {
  deleteStakeholder,
  getExportStakeholdersByIdsUrl,
  getExportStakeholdersUrl,
  getGetStakeholderImportTemplateUrl,
  getGetStakeholdersQueryKey,
  updateStakeholder,
  useCreateStakeholder,
  useGetStakeholders,
  useImportStakeholders,
  useUpdateStakeholder,
} from '@/lib/api/generated/stakeholders/stakeholders';
import { ImportDialog } from '@/components/ImportDialog';
import {
  useCreateStakeholderRoleType,
  useGetStakeholderRoleTypes,
} from '@/lib/api/generated/stakeholder-role-types/stakeholder-role-types';
import { GetStakeholdersSortBy } from '@/lib/api/generated/types/getStakeholdersSortBy';
import type {
  CreateStakeholderDto,
  GetStakeholdersAccuracyItem,
  GetStakeholdersSortOrder,
  GetStakeholdersStatusesItem,
  LocationEntity,
  StakeholderEntity,
  UpdateStakeholderDto,
} from '@/lib/api/generated/types';
import { useStakeholderNewRow } from './StakeholderNewRow';
import { getStakeholderColumns, stakeholderStatusOptions, type StakeholderStatus } from './columns';

const PAGE_SIZE = 50;

// Shared palette for Role type coloring — the filter dropdown (Badge
// `variant`) and the Role type cell/form pickers (raw `triggerClassName`,
// since CreatableCombobox isn't on the Badge variant system) draw from the
// same ordered list, so a given role type gets the same color in both
// places. Role types are a user-grown catalog (CreatableCombobox), not a
// fixed enum, so there's no per-value semantic color to assign — cycle by
// position instead, same reasoning as Consultants' roleFilterVariant.
const ROLE_TYPE_PALETTE: {
  variant: NonNullable<React.ComponentProps<typeof Badge>['variant']>;
  triggerClassName: string;
}[] = [
  { variant: 'default', triggerClassName: 'border-primary/30 bg-primary/10 text-primary' },
  { variant: 'info', triggerClassName: 'border-info/30 bg-info/10 text-info' },
  { variant: 'warning', triggerClassName: 'border-warning/30 bg-warning/10 text-warning' },
  { variant: 'secondary', triggerClassName: 'border-transparent bg-secondary text-secondary-foreground' },
  { variant: 'outline', triggerClassName: 'border-border text-foreground' },
  { variant: 'muted', triggerClassName: 'border-transparent bg-muted text-muted-foreground' },
];
function roleTypeStyle(index: number) {
  return ROLE_TYPE_PALETTE[index % ROLE_TYPE_PALETTE.length];
}

export function StakeholdersTable({
  canCreate = true,
  canUpdate = true,
  canDelete = true,
}: {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [roleTypeIds, setRoleTypeIds] = React.useState<string[] | undefined>();
  const [accuracy, setAccuracy] = React.useState<GetStakeholdersAccuracyItem[] | undefined>();
  const [statuses, setStatuses] = React.useState<GetStakeholdersStatusesItem[] | undefined>();
  const [locationIds, setLocationIds] = React.useState<string[] | undefined>();
  // Name/level for the Coverage filter's currently selected location ids —
  // the API only returns these alongside a live search result, not by id, so
  // this is seeded as the user searches (see LocationFilterButton's
  // onResolve) and only needs to cover whatever's selected in this session.
  // Same pattern as Companies' marketInfoById.
  const [coverageInfoById, setCoverageInfoById] = React.useState<
    Map<string, { name: string; level: LocationEntity['level'] }>
  >(new Map());
  const resolveCoverageInfo = React.useCallback((id: string, name: string, level: LocationEntity['level']) => {
    setCoverageInfoById((prev) => (prev.get(id)?.name === name ? prev : new Map(prev).set(id, { name, level })));
  }, []);
  const [sortBy, setSortBy] = React.useState<GetStakeholdersSortBy | undefined>();
  const [sortOrder, setSortOrder] = React.useState<GetStakeholdersSortOrder>('desc');
  const [selected, setSelected] = React.useState<StakeholderEntity[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const importStakeholders = useImportStakeholders();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);


  // Arrived from the command palette's "Add a Stakeholder" action
  // (`/stakeholders?new=1`). The new row is always on screen now, so there's
  // nothing to open — just put the caret in it, then strip the param so
  // refresh/back doesn't re-steal focus.
  React.useEffect(() => {
    if (searchParams.get('new') === '1') {
      requestAnimationFrame(() => focusNewRowStart());
      router.replace('/stakeholders');
    }
  }, [searchParams, router]);

  const { data, isLoading, isFetching, isError, error } = useGetStakeholders(
    {
      page,
      pageSize: PAGE_SIZE,
      q: search,
      roleTypeIds,
      accuracy,
      statuses,
      locationIds,
      sortBy,
      sortOrder,
    },
    // Keep the previous page's rows while the next one loads — infinite
    // scroll otherwise flashes the whole list back to a loading skeleton
    // every time the sentinel row requests another batch.
    { query: { placeholderData: keepPreviousData } },
  );
  const result = data?.status === 200 ? data.data : undefined;
  const stakeholders = useInfinitePages(result?.data, page, isFetching);


  const { data: roleTypeData } = useGetStakeholderRoleTypes({ take: 200 });
  const roleTypeRows = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const roleTypeOptions = React.useMemo(
    () =>
      roleTypeRows.map((r, i) => ({
        id: r.id,
        name: r.name,
        triggerClassName: roleTypeStyle(i).triggerClassName,
      })),
    [roleTypeRows],
  );


  const stakeholderFilters: DataGridFilter[] = React.useMemo(
    () => [
      {
        columnId: 'roleType',
        title: 'Role type',
        // Same treatment as Companies/Job Orders' header filters: a compact
        // icon button inside the column header instead of a toolbar pill.
        // Single-select with a colored badge per option — Role types are a
        // user-grown catalog rather than a fixed enum, so there's no fixed
        // semantic color per value — cycle the palette by position instead.
        single: true,
        inHeader: true,
        options: roleTypeRows.map((r, i) => ({
          value: r.id,
          label: r.name,
          variant: roleTypeStyle(i).variant,
        })),
      },
      {
        columnId: 'status',
        title: 'Status',
        // Multi-select — same reasoning as Role type above.
        inHeader: true,
        options: stakeholderStatusOptions.map((o) => ({ value: o.value, label: o.label, variant: o.variant })),
      },
      {
        columnId: 'coverage',
        title: 'City Coverage',
        inHeader: true,
        render: ({ selected, onChange }: { selected: string[]; onChange: (values: string[]) => void }) => (
          <LocationFilterButton
            selected={selected}
            onChange={onChange}
            onResolve={resolveCoverageInfo}
            title="City Coverage"
          />
        ),
        labelFor: (id: string) => coverageInfoById.get(id)?.name ?? id,
        chipContent: (id: string) => {
          const info = coverageInfoById.get(id);
          return (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {info?.name ?? id}
              {info ? (
                <span className="text-[10px] tracking-wide opacity-70 uppercase">{LEVEL_LABEL[info.level]}</span>
              ) : null}
            </span>
          );
        },
      },
    ],
    [roleTypeRows, coverageInfoById, resolveCoverageInfo],
  );

  const createRoleType = useCreateStakeholderRoleType({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/stakeholder-role-types'] }),
      onError: (err) => toast.error(err.message || 'Failed to add role type'),
    },
  });
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    return res.data;
  }

  const createJobTitle = useCreateJobTitle();
  async function handleCreateJobTitle(name: string) {
    const res = await createJobTitle.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add job title');
    queryClient.invalidateQueries({ queryKey: ['/job-titles'] });
    return res.data;
  }

  const createStakeholderMutation = useCreateStakeholder({
    mutation: {
      onSuccess: () => {
        // Reset to page 1, not just invalidate — the new row sorts to the
        // top (`sortOrder` defaults to 'desc'), which shifts every row's
        // position across whatever later pages are already loaded via
        // useInfinitePages. Invalidating alone only refetches the
        // currently-mounted page, leaving stale, now-misaligned data in the
        // rest — duplicate ids once flattened. Landing back on page 1 makes
        // useInfinitePages reset its slots cleanly (see its own doc), and
        // is also just where you'd want to see the thing you just added.
        setPage(1);
        queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
        toast.success('Stakeholder added');
      },
      onError: (err) => toast.error(err.message || 'Failed to add stakeholder'),
    },
  });

  const updateStakeholderMutation = useUpdateStakeholder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
      },
      onError: (err) => toast.error(err.message || 'Failed to update stakeholder'),
    },
  });
  const pendingRowId = updateStakeholderMutation.isPending ? (updateStakeholderMutation.variables?.id ?? null) : null;

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const roleTypeFilter = columnFilters.find((f) => f.id === 'roleType')?.value as string[] | undefined;
    const accuracyFilter = columnFilters.find((f) => f.id === 'isAccurate')?.value as string[] | undefined;
    const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as string[] | undefined;
    const coverageFilter = columnFilters.find((f) => f.id === 'coverage')?.value as string[] | undefined;
    const sort = sorting[0];
    const sortField = sort && sort.id in GetStakeholdersSortBy ? (sort.id as GetStakeholdersSortBy) : undefined;
    setSearch(search.trim() || undefined);
    setRoleTypeIds(roleTypeFilter);
    setAccuracy(accuracyFilter?.length ? (accuracyFilter as GetStakeholdersAccuracyItem[]) : undefined);
    setStatuses(statusFilter?.length ? (statusFilter as GetStakeholdersStatusesItem[]) : undefined);
    setLocationIds(coverageFilter?.length ? coverageFilter : undefined);
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setPage(1);
  }

  // The new-row variant: awaited and rethrowing, so `useStakeholderNewRow`
  // knows whether to clear the row or keep what was typed. The mutation's
  // own onSuccess/onError still handle the page reset and toasts.
  async function handleCreateFromNewRow(dto: CreateStakeholderDto) {
    await createStakeholderMutation.mutateAsync({ data: dto });
  }

  const newRow = useStakeholderNewRow({
    roleTypes: roleTypeOptions,
    onCreateJobTitle: handleCreateJobTitle,
    onCreateRoleType: handleCreateRoleType,
    onCreate: handleCreateFromNewRow,
    disabled: !canCreate,
  });

  const handleRoleTypeChange = React.useCallback(
    (stakeholder: StakeholderEntity, roleTypeId: string) => {
      updateStakeholderMutation.mutate(
        // Explicit `null` clears the role type back to "Uncategorized" — the
        // generated DTO types this field as `string | undefined` (undefined
        // means "leave alone" server-side), so a cast is needed to send the
        // clearing value at all. Same reasoning as the
        // `CreateStakeholderContactHistoryDto` cast in StakeholderDetail.tsx.
        { id: stakeholder.id, data: { roleTypeId: roleTypeId || null } as UpdateStakeholderDto },
        { onSuccess: () => toast.success('Role type updated') },
      );
    },
    [updateStakeholderMutation],
  );

  const handleStatusChange = React.useCallback(
    (stakeholder: StakeholderEntity, status: StakeholderStatus) => {
      updateStakeholderMutation.mutate(
        { id: stakeholder.id, data: { status } },
        { onSuccess: () => toast.success('Status updated') },
      );
    },
    [updateStakeholderMutation],
  );

  // Fires several concurrent requests directly (not via a mutation hook,
  // which only tracks one in-flight call at a time) so bulk gets a single
  // summary toast instead of one per row.
  async function handleBulkSetAccuracy(isAccurate: boolean | null) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(
      selected.map((s) => updateStakeholder(s.id, { isAccurate } as UpdateStakeholderDto)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
    const label = isAccurate === null ? 'Unchecked' : isAccurate ? 'Accurate' : 'Inaccurate';
    if (succeeded > 0) toast.success(`Marked ${succeeded} stakeholder${succeeded === 1 ? '' : 's'} as ${label}`);
    if (failed > 0) toast.error(`Failed for ${failed} stakeholder${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelected([]);
  }

  function handleBulkDelete() {
    setDeleteConfirmOpen(false);
    const toDelete = selected;
    const label = `${toDelete.length} stakeholder${toDelete.length === 1 ? '' : 's'}`;
    // No restore endpoint for Stakeholder — delayed mode: nothing is sent to
    // the server until the undo window elapses, so Undo is exact rather than
    // cosmetic (see @/lib/delete-with-undo).
    deleteWithUndo({
      label,
      deleteFn: async () => {
        const results = await Promise.allSettled(toDelete.map((s) => deleteStakeholder(s.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`Failed to delete ${failed} of ${toDelete.length} stakeholders`);
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() }),
    });
    setSelected([]);
  }

  // Routes through the server (not the old in-browser xlsx build) so
  // formatting stays in one place and scope is re-checked on every export —
  // a selection exports exactly those rows; no selection exports everything
  // matching the current filters, unbounded.
  async function handleExport() {
    setIsExporting(true);
    // A loading toast, not just the isExporting-driven button label — this
    // is triggered from a DropdownMenuItem, and the dropdown closes the
    // instant it's clicked, so a label change on that now-unmounted item is
    // never actually seen. The toast (same `id` as the success/error below,
    // so it morphs in place rather than stacking) is what's actually visible
    // while an unbounded, potentially-slow export is in flight.
    toast.loading('Exporting…', { id: 'export-stakeholders' });
    // The server has no ambient concept of "the viewer's timezone" — it only
    // ever sees UTC timestamps, so date/time export columns need this sent
    // along explicitly.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (selected.length > 0) {
        await downloadFile(getExportStakeholdersByIdsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected.map((s) => s.id), timezone }),
        });
      } else {
        await downloadFile(
          getExportStakeholdersUrl({
            q: search,
            roleTypeIds,
            accuracy,
            statuses,
            locationIds,
            sortBy,
            sortOrder,
            timezone,
          }),
        );
      }
      toast.success('Export ready', { id: 'export-stakeholders' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: 'export-stakeholders' });
    } finally {
      setIsExporting(false);
    }
  }

  const columns = React.useMemo(
    () =>
      getStakeholderColumns({
        roleTypes: roleTypeOptions,
        onRoleTypeChange: handleRoleTypeChange,
        onCreateRoleType: handleCreateRoleType,
        onStatusChange: handleStatusChange,
        pendingRowId,
        canUpdate,
      }),
    [roleTypeOptions, handleRoleTypeChange, handleStatusChange, pendingRowId, canUpdate],
  );

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load stakeholders: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={stakeholders}
        isLoading={isLoading}
        isFetching={isFetching}
        searchPlaceholder="Search stakeholders…"
        filters={stakeholderFilters}
        emptyState="No stakeholders yet. Add your first contact to get started."
        getRowId={(s) => s.id}
        onRowClick={(s) => router.push(`/stakeholders/${s.id}`)}
        onSelectionChange={setSelected}
        enableRowRangeSelect
        hideSelectColumn
        // Excel-style entry: an always-present row parked on the table's
        // bottom edge, one editor per writable column, rows scrolling behind
        // it. Replaces the old bottom-edge quick-add overlay (issue #131) —
        // see `useStakeholderNewRow` for which fields it collects.
        newRow={newRow}
        toolbar={
          <div className="flex items-center gap-2">
            {canCreate && canUpdate ? (
              <ImportDialog
                entityLabel="Stakeholders"
                templateUrl={getGetStakeholderImportTemplateUrl()}
                upload={async (file, commit) => {
                  const res = await importStakeholders.mutateAsync({ data: { file, commit } });
                  if (res.status !== 201) throw new Error('Import failed');
                  return res.data;
                }}
                onImported={() => queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() })}
              />
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="lg" disabled={isBulkUpdating || isExporting}>
                    {isBulkUpdating ? 'Updating…' : isExporting ? 'Exporting…' : 'Bulk Actions'}
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
                  <Download />
                  {isExporting ? 'Exporting…' : 'Export to Excel'}
                </DropdownMenuItem>
                {selected.length > 0 && (canUpdate || canDelete) ? (
                  <>
                    <DropdownMenuSeparator />
                    {canUpdate ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <CheckCheck />
                          Mark details
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-48">
                          <DropdownMenuItem onClick={() => handleBulkSetAccuracy(true)}>
                            <Badge variant="success" className="rounded-md">
                              Accurate
                            </Badge>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkSetAccuracy(false)}>
                            <Badge variant="destructive" className="rounded-md">
                              Inaccurate
                            </Badge>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null}
                    {canDelete ? (
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        selectionContextMenu={
          <>
            <ContextMenuItem onClick={handleExport}>
              <Download />
              Export to Excel
            </ContextMenuItem>
            {canUpdate ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <CheckCheck />
                  Mark details
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-48">
                  <ContextMenuItem onClick={() => handleBulkSetAccuracy(true)}>
                    <Badge variant="success" className="rounded-md">
                      Accurate
                    </Badge>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleBulkSetAccuracy(false)}>
                    <Badge variant="destructive" className="rounded-md">
                      Inaccurate
                    </Badge>
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : null}
            {canDelete ? (
              <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 />
                Delete
              </ContextMenuItem>
            ) : null}
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

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${selected.length} stakeholder${selected.length === 1 ? '' : 's'}?`}
        description="You can undo this from the toast right after, or it's gone for good."
        onConfirm={handleBulkDelete}
      />

    </>
  );
}

