'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { ChevronDown, Download, Sparkles, Tag, Trash2 } from 'lucide-react';
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
import { DataGrid, type DataGridQuery } from '@/components/DataGrid';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { downloadFile } from '@/lib/api/fetcher';
import {
  createClient as createClientRequest,
  deleteClient,
  getExportClientsByIdsUrl,
  getExportClientsUrl,
  getGetClientImportTemplateUrl,
  getGetClientsQueryKey,
  restoreClient,
  updateClient,
  useGetClients,
  useImportClients,
  useUpdateClient,
} from '@/lib/api/generated/clients/clients';
import { ImportDialog } from '@/components/ImportDialog';
import { GetClientsSortBy } from '@/lib/api/generated/types/getClientsSortBy';
import type {
  CreateClientDto,
  GetClientsSortOrder,
  GetClientsStatusesItem,
} from '@/lib/api/generated/types';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import { useCreateSpecialization } from '@/lib/api/generated/specializations/specializations';
import { useSpecializationOptions } from '@/hooks/use-catalog-options';
import {
  NewSpecializationDialog,
  type NewSpecializationRequest,
} from '@/components/NewSpecializationDialog';
import type { CreatableComboboxOption } from '@/components/CreatableCombobox';
import { useCompanyNewRow } from './CompanyNewRow';
import { getCompanyColumns } from './columns';
import { qualityOptions, statusOptions, type ClientQuality, type ClientStatus, type Company, type CompanyAppliedFilters } from './schema';

const PAGE_SIZE = 50;

export function CompaniesTable({
  filters,
  canCreate = true,
  canUpdate = true,
  canDelete = true,
  canCreateSpecialization = false,
}: {
  /** Committed from the search gate's action bar — this table has no filter UI of its own. */
  filters: CompanyAppliedFilters;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  /** `specialization:create` — without it the Specialization cell is pick-only. */
  canCreateSpecialization?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  // The DataGrid's own free-text box — distinct from the gate's committed
  // filters above it (search-as-you-type, no "Search" click required), same
  // pattern as CandidatesTable.
  const [search, setSearch] = React.useState<string | undefined>();
  // Seeded from the gate's "Sort by" selection; a column header click can
  // still override it locally afterward, same as any other DataGrid.
  const [sortBy, setSortBy] = React.useState<GetClientsSortBy | undefined>(filters.sortBy);
  const [sortOrder, setSortOrder] = React.useState<GetClientsSortOrder>(filters.sortOrder ?? 'desc');
  const [selected, setSelected] = React.useState<Company[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  // Rethrows so the new row keeps the typed-in draft on failure.
  async function handleCreateClient(dto: CreateClientDto) {
    try {
      const res = await createClientRequest(dto);
      if (res.status !== 201) throw new Error('Failed to create company');
      // Back to page 1 for the same reason every other table does it: a new
      // row shifts positions across the pages useInfinitePages already holds.
      setPage(1);
      queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
      toast.success(`${res.data.companyName} added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create company');
      throw err;
    }
  }


  // 4 rows — cheap, and React Query dedupes this against the gate's own copy.
  const { data: industriesData } = useGetIndustries();
  const industryOptions = React.useMemo(
    () =>
      (industriesData?.status === 200 ? industriesData.data : []).map((i) => ({
        value: i.id,
        label: i.name,
      })),
    [industriesData],
  );

  const newRow = useCompanyNewRow({
    onCreate: handleCreateClient,
    disabled: !canCreate,
    industries: industryOptions,
    canCreateSpecialization,
  });
  const importClients = useImportClients();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  // DataGrid reports selected rows in current table order (TanStack Table's
  // row-selection model), not the order they were actually clicked in — but
  // Enrich Stakeholders needs true selection order (see
  // StakeholderEnrichmentWorkspace's doc). Track it here instead of in
  // DataGrid itself (shared by every table in the app — too much blast
  // radius to change there): diff the newly-reported set against what we
  // already had, drop ids no longer selected, append newly-added ones in the
  // order DataGrid handed them to us.
  const selectionOrderRef = React.useRef<string[]>([]);
  function handleSelectionChange(rows: Company[]) {
    const ids = new Set(rows.map((r) => r.id));
    selectionOrderRef.current = selectionOrderRef.current.filter((id) => ids.has(id));
    for (const row of rows) if (!selectionOrderRef.current.includes(row.id)) selectionOrderRef.current.push(row.id);
    setSelected(rows);
  }

  // A new `filters` object only ever arrives from a fresh "Search" click in
  // the gate (even an unchanged re-search) — always worth restarting
  // pagination for, and re-seeding sort from whatever "Sort by" now says
  // (any column-header override from the previous search is intentionally
  // dropped).
  React.useEffect(() => {
    setPage(1);
    setSortBy(filters.sortBy);
    setSortOrder(filters.sortOrder ?? 'desc');
  }, [filters]);

  const { data, isLoading, isFetching, isError, error } = useGetClients(
    {
      page,
      pageSize: PAGE_SIZE,
      q: search,
      statuses: filters.statuses as GetClientsStatusesItem[] | undefined,
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
  const companies = useInfinitePages(result?.data, page, isFetching);

  // The grid itself reports search (its own free-text box) and sorting —
  // faceted filters still live entirely in the gate's action bar.
  function handleQueryChange({ search, sorting }: DataGridQuery) {
    const sort = sorting[0];
    const sortField = sort && sort.id in GetClientsSortBy ? (sort.id as GetClientsSortBy) : undefined;
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setSearch(search.trim() || undefined);
    setPage(1);
  }

  // Fires several concurrent requests directly (not via a mutation hook,
  // which only tracks one in-flight call at a time) so bulk gets a single
  // summary toast instead of one per row.
  async function handleBulkSetStatus(nextStatus: ClientStatus) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selected.map((c) => updateClient(c.id, { status: nextStatus })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    const label = statusOptions.find((o) => o.value === nextStatus)!.label;
    if (succeeded > 0) toast.success(`Marked ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'} as ${label}`);
    if (failed > 0) toast.error(`Failed for ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkUpdating(false);
    setSelected([]);
  }

  async function handleBulkSetQuality(nextQuality: ClientQuality) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selected.map((c) => updateClient(c.id, { quality: nextQuality })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    const label = qualityOptions.find((o) => o.value === nextQuality)!.label;
    if (succeeded > 0) toast.success(`Marked ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'} as ${label} quality`);
    if (failed > 0) toast.error(`Failed for ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkUpdating(false);
    setSelected([]);
  }

  const updateCompanyMutation = useUpdateClient({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to update company'),
    },
  });
  const pendingRowId = updateCompanyMutation.isPending ? (updateCompanyMutation.variables?.id ?? null) : null;

  const handleStatusChange = React.useCallback(
    (company: Company, statusValue: string) => {
      updateCompanyMutation.mutate(
        { id: company.id, data: { status: statusValue as ClientStatus } },
        { onSuccess: () => toast.success('Status updated') },
      );
    },
    [updateCompanyMutation],
  );

  const handleQualityChange = React.useCallback(
    (company: Company, qualityValue: string) => {
      updateCompanyMutation.mutate(
        { id: company.id, data: { quality: qualityValue as ClientQuality } },
        { onSuccess: () => toast.success('Quality updated') },
      );
    },
    [updateCompanyMutation],
  );


  // Specializations are fetched for whichever row's cell is open, scoped to
  // that row's industry — 775 rows is far past what one cell can hold, and an
  // unscoped list would offer values from the wrong industry.
  const [specCellCompany, setSpecCellCompany] = React.useState<Company | null>(null);
  const {
    options: specializationOptions,
    onQueryChange: onSpecializationQueryChange,
    isFetching: isFetchingSpecializations,
  } = useSpecializationOptions(specCellCompany?.industryId);

  const handleIndustryChange = React.useCallback(
    (company: Company, industryId: string) => {
      if (industryId === company.industryId) return;
      updateCompanyMutation.mutate(
        // Its specialization belonged to the old industry, so it can't survive
        // the move — same rule CompanyDetail applies when its Industry picker
        // changes (it resets specializationId alongside).
        { id: company.id, data: { industryId, specializationId: null } },
        {
          onSuccess: () =>
            toast.success(
              company.specializationId
                ? 'Industry updated — specialization cleared'
                : 'Industry updated',
            ),
        },
      );
    },
    [updateCompanyMutation],
  );

  const handleSpecializationChange = React.useCallback(
    (company: Company, specializationId: string) => {
      updateCompanyMutation.mutate(
        { id: company.id, data: { specializationId: specializationId || null } },
        { onSuccess: () => toast.success('Specialization updated') },
      );
    },
    [updateCompanyMutation],
  );

  // Creating a specialization needs a parent industry, so the cell's "Add
  // <name>" hands off to a dialog and waits on it. The promise below is what
  // CreatableCombobox awaits, so the cell stays in its "creating" state for
  // exactly as long as the prompt is open.
  const [specRequest, setSpecRequest] = React.useState<NewSpecializationRequest | null>(null);
  const specResolver = React.useRef<((option: CreatableComboboxOption | null) => void) | null>(null);
  const createSpecialization = useCreateSpecialization();

  const handleCreateSpecialization = React.useCallback(
    (company: Company, name: string) =>
      new Promise<CreatableComboboxOption | null>((resolve) => {
        specResolver.current = resolve;
        setSpecRequest({ name, industryId: company.industryId });
        setSpecCellCompany(company);
      }),
    [],
  );

  function settleSpecRequest(option: CreatableComboboxOption | null) {
    specResolver.current?.(option);
    specResolver.current = null;
    setSpecRequest(null);
  }

  async function handleConfirmNewSpecialization(industryId: string) {
    const request = specRequest;
    const company = specCellCompany;
    if (!request || !company) return;
    try {
      const res = await createSpecialization.mutateAsync({
        data: { name: request.name, industryId },
      });
      if (res.status !== 201) throw new Error('Failed to add specialization');
      // Retag the company when they picked a different industry, so it can't
      // sit in one industry holding a specialization parented to another.
      const data =
        industryId === company.industryId
          ? { specializationId: res.data.id }
          : { industryId, specializationId: res.data.id };
      await updateCompanyMutation.mutateAsync({ id: company.id, data });
      toast.success(`${res.data.name} added`);
      // The cell writes the value itself from what we resolve with, so this
      // resolves *after* the company is saved — no half-applied row.
      settleSpecRequest({ id: res.data.id, name: res.data.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add specialization');
      settleSpecRequest(null);
    }
  }

  function handleBulkDelete() {
    setDeleteConfirmOpen(false);
    const toDelete = selected;
    const label = `${toDelete.length} compan${toDelete.length === 1 ? 'y' : 'ies'}`;
    // Client has a real backend restore endpoint — restore mode: the delete
    // commits right away and Undo calls restoreClient, rather than deferring
    // the delete itself.
    deleteWithUndo({
      label,
      deleteFn: async () => {
        const results = await Promise.allSettled(toDelete.map((c) => deleteClient(c.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`Failed to delete ${failed} of ${toDelete.length} companies`);
      },
      restoreFn: async () => {
        await Promise.allSettled(toDelete.map((c) => restoreClient(c.id)));
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
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
    toast.loading('Exporting…', { id: 'export-companies' });
    // The server has no ambient concept of "the viewer's timezone" — it only
    // ever sees UTC timestamps, so date/time export columns need this sent
    // along explicitly.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (selected.length > 0) {
        await downloadFile(getExportClientsByIdsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected.map((c) => c.id), timezone }),
        });
      } else {
        await downloadFile(
          getExportClientsUrl({
            q: search,
            statuses: filters.statuses as GetClientsStatusesItem[] | undefined,
            industryIds: filters.industryIds,
            specializationIds: filters.specializationIds,
            locationIds: filters.locationIds,
            sortBy,
            sortOrder,
            timezone,
          }),
        );
      }
      toast.success('Export ready', { id: 'export-companies' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: 'export-companies' });
    } finally {
      setIsExporting(false);
    }
  }

  function handleEnrichStakeholders() {
    router.push(
      `/stakeholders/enrich?clientIds=${encodeURIComponent(selectionOrderRef.current.join(','))}&from=companies`,
    );
  }

  const columns = React.useMemo(
    () =>
      getCompanyColumns({
        onStatusChange: handleStatusChange,
        onQualityChange: handleQualityChange,
        onIndustryChange: handleIndustryChange,
        onSpecializationChange: handleSpecializationChange,
        onCreateSpecialization: handleCreateSpecialization,
        industries: industryOptions,
        specializationOptions,
        onSpecializationQueryChange,
        isFetchingSpecializations,
        onSpecializationCellOpen: setSpecCellCompany,
        canCreateSpecialization,
        pendingRowId,
        canUpdate,
      }),
    [
      handleStatusChange,
      handleQualityChange,
      handleIndustryChange,
      handleSpecializationChange,
      handleCreateSpecialization,
      industryOptions,
      specializationOptions,
      onSpecializationQueryChange,
      isFetchingSpecializations,
      canCreateSpecialization,
      pendingRowId,
      canUpdate,
    ],
  );

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load companies: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        newRow={newRow}
        columns={columns}
        data={companies}
        isLoading={isLoading}
        isFetching={isFetching}
        searchPlaceholder="Search companies…"
        emptyState="No companies match these filters."
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`/companies/${c.id}`)}
        onSelectionChange={handleSelectionChange}
        enableRowRangeSelect
        hideSelectColumn
        toolbar={
          <div className="flex items-center gap-2">
            {canCreate && canUpdate ? (
              <ImportDialog
                entityLabel="Companies"
                templateUrl={getGetClientImportTemplateUrl()}
                upload={async (file, commit) => {
                  // customFetch throws on any non-2xx response, so a resolved
                  // call is always the 201 envelope — this guard is just for
                  // TypeScript's discriminated-union narrowing.
                  const res = await importClients.mutateAsync({ data: { file, commit } });
                  if (res.status !== 201) throw new Error('Import failed');
                  return res.data;
                }}
                onImported={() => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() })}
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
                {selected.length > 0 ? (
                  <DropdownMenuItem onClick={handleEnrichStakeholders}>
                    <Sparkles />
                    Enrich Stakeholders
                  </DropdownMenuItem>
                ) : null}
                {selected.length > 0 && (canUpdate || canDelete) ? (
                  <>
                    <DropdownMenuSeparator />
                    {canUpdate ? (
                      <>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Tag />
                            Set status
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="min-w-48">
                            {statusOptions.map((o) => (
                              <DropdownMenuItem key={o.value} onClick={() => handleBulkSetStatus(o.value as ClientStatus)}>
                                <Badge className={o.triggerClassName}>{o.label}</Badge>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Tag />
                            Set quality
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="min-w-48">
                            {qualityOptions.map((o) => (
                              <DropdownMenuItem key={o.value} onClick={() => handleBulkSetQuality(o.value as ClientQuality)}>
                                <Badge className={o.triggerClassName}>{o.label}</Badge>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
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
            <ContextMenuItem onClick={handleEnrichStakeholders}>
              <Sparkles />
              Enrich Stakeholders
            </ContextMenuItem>
            {canUpdate ? (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Tag />
                    Set status
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="min-w-48">
                    {statusOptions.map((o) => (
                      <ContextMenuItem key={o.value} onClick={() => handleBulkSetStatus(o.value as ClientStatus)}>
                        <Badge className={o.triggerClassName}>{o.label}</Badge>
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Tag />
                    Set quality
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="min-w-48">
                    {qualityOptions.map((o) => (
                      <ContextMenuItem key={o.value} onClick={() => handleBulkSetQuality(o.value as ClientQuality)}>
                        <Badge className={o.triggerClassName}>{o.label}</Badge>
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </>
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
        title={`Delete ${selected.length} compan${selected.length === 1 ? 'y' : 'ies'}?`}
        description="You can undo this from the toast right after, or it's gone for good."
        onConfirm={handleBulkDelete}
      />

      <NewSpecializationDialog
        request={specRequest}
        industries={industryOptions}
        isSaving={createSpecialization.isPending || updateCompanyMutation.isPending}
        onCancel={() => settleSpecRequest(null)}
        onConfirm={handleConfirmNewSpecialization}
      />
    </>
  );
}

