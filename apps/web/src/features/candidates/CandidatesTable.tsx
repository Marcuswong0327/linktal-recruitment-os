'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronDown, Download, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { LocationFilterButton } from '@/components/LocationMultiSelect';
import { SpecializationFilterButton } from '@/components/SpecializationPicker';
import { TextFilter } from '@/components/TextFilter';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetJobRoleTypesQueryKey,
  useCreateJobRoleType,
  useGetJobRoleTypes,
} from '@/lib/api/generated/job-role-types/job-role-types';
import { useCandidateNewRow } from './CandidateNewRow';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { downloadFile } from '@/lib/api/fetcher';
import {
  deleteCandidate,
  getCandidates,
  addCandidateContactHistory,
  createCandidate as createCandidateRequest,
  getExportCandidatesByIdsUrl,
  getExportCandidatesUrl,
  getGetCandidateImportTemplateUrl,
  getGetCandidatesQueryKey,
  restoreCandidate,
  updateCandidate,
  useGetCandidates,
  useImportCandidates,
} from '@/lib/api/generated/candidates/candidates';
import { ImportDialog } from '@/components/ImportDialog';
import { GetCandidatesSortBy } from '@/lib/api/generated/types/getCandidatesSortBy';
import type {
  CreateCandidateDto,
  GetCandidatesParams,
  GetCandidatesSortOrder,
  GetCandidatesStatusesItem,
} from '@/lib/api/generated/types';
import { candidateColumns } from './columns';
import {
  candidateStatuses,
  candidateStatusLabels,
  candidateStatusVariants,
  type Candidate,
  type CandidateAppliedFilters,
  type CandidateStatus,
} from './schema';

const PAGE_SIZE = 50;
// Hard ceiling on "select all matching" — export/bulk-action targets stay
// bounded even if a filter combination is barely narrowed at all (e.g. no
// filters, the full ~4,000-row table).
const SELECT_ALL_CAP = 5000;

export function CandidatesTable({
  filters,
  canCreate = true,
  canUpdate = true,
  canDelete = true,
}: {
  /** Committed from the search gate; column header filters merge on top. */
  filters: CandidateAppliedFilters;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  // The DataGrid's own free-text box — distinct from the gate's committed
  // filters above it (search-as-you-type, no "Search" click required), same
  // pattern as ConsultantsTable.
  const [search, setSearch] = React.useState<string | undefined>();
  // Seeded from the gate's "Sort by" selection; a column header click can
  // still override it locally afterward.
  const [sortBy, setSortBy] = React.useState<GetCandidatesSortBy | undefined>(filters.sortBy);
  const [sortOrder, setSortOrder] = React.useState<GetCandidatesSortOrder>(filters.sortOrder ?? 'desc');
  const [selected, setSelected] = React.useState<Candidate[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  // Column-header filters (merged with gate where noted).
  const [columnLocationIds, setColumnLocationIds] = React.useState<string[] | undefined>();
  const [columnJobRoleTypeIds, setColumnJobRoleTypeIds] = React.useState<string[] | undefined>();
  const [columnSpecializationIds, setColumnSpecializationIds] = React.useState<string[] | undefined>();
  const [firstName, setFirstName] = React.useState<string | undefined>();
  const [lastName, setLastName] = React.useState<string | undefined>();
  const [currentSalary, setCurrentSalary] = React.useState<string | undefined>();
  const [expectedSalary, setExpectedSalary] = React.useState<string | undefined>();

  const [locationNames, setLocationNames] = React.useState<Record<string, string>>({});
  const registerLocationName = React.useCallback(
    (id: string, name: string) => setLocationNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [specializationNames, setSpecializationNames] = React.useState<Record<string, string>>({});
  const registerSpecializationName = React.useCallback(
    (id: string, name: string) =>
      setSpecializationNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );

  // Rosters for the new row's pickers + header filters.
  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const createJobRoleType = useCreateJobRoleType();

  const { data: roleTypesData } = useGetJobRoleTypes({ take: 200 });
  const roleTypes = roleTypesData?.status === 200 ? roleTypesData.data : [];
  const jobRoleTypeOptions = React.useMemo(
    () => roleTypes.map((r) => ({ value: r.id, label: r.name })),
    [roleTypes],
  );

  async function handleCreateJobRoleType(name: string) {
    try {
      const res = await createJobRoleType.mutateAsync({ data: { name } });
      if (res.status !== 201) throw new Error('Failed to add role type');
      queryClient.invalidateQueries({ queryKey: getGetJobRoleTypesQueryKey() });
      return res.data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add role type');
      throw err;
    }
  }

  // Rethrows so the new row keeps the typed-in draft on failure.
  async function handleCreateCandidate(dto: CreateCandidateDto, note?: string) {
    try {
      const res = await createCandidateRequest(dto);
      if (res.status !== 201) throw new Error('Failed to create candidate');
      // The Notes column reads the latest CandidateContactHistory row, so a
      // note typed in the new row lands as one. SCREENING/'call' is the shape
      // of a first contact and is what the bulk of existing history uses;
      // both stay editable from the candidate's detail page.
      if (note) {
        const noted = await addCandidateContactHistory(res.data.id, {
          contactType: 'call',
          category: 'SCREENING',
          screeningNotes: note,
        });
        // Non-fatal: the candidate is already saved, so surface the note
        // failing rather than making it look like the whole row didn't take.
        if (noted.status !== 201) toast.error('Candidate saved, but the note could not be added');
      }
      // Back to page 1 for the same reason every other table does it: a new
      // row shifts positions across the pages useInfinitePages already holds.
      setPage(1);
      queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
      toast.success('Candidate added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create candidate');
      throw err;
    }
  }

  const newRow = useCandidateNewRow({
    industries,
    userIndustryIds: session?.user?.industryIds ?? [],
    onCreateJobRoleType: handleCreateJobRoleType,
    onCreate: handleCreateCandidate,
    disabled: !canCreate,
  });
  const importCandidates = useImportCandidates();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  // Selection is normally page-scoped (see DataGrid's onSelectionChange doc)
  // — this flips on once the user explicitly asks to extend it to every row
  // matching the current filters, not just what's rendered on this page.
  const [selectAllMode, setSelectAllMode] = React.useState(false);
  const [isSelectingAll, setIsSelectingAll] = React.useState(false);

  // A new `filters` object only ever arrives from a fresh "Search" click in
  // the gate (even an unchanged re-search) — always worth restarting
  // pagination for, and re-seeding sort from whatever "Sorted By" now says
  // (any column-header override from the previous search is intentionally
  // dropped). Column header filters reset so a new gate commit isn't mixed
  // with stale header state from the prior search.
  React.useEffect(() => {
    setPage(1);
    setSortBy(filters.sortBy);
    setSortOrder(filters.sortOrder ?? 'desc');
    setColumnLocationIds(undefined);
    setColumnJobRoleTypeIds(undefined);
    setColumnSpecializationIds(undefined);
    setFirstName(undefined);
    setLastName(undefined);
    setCurrentSalary(undefined);
    setExpectedSalary(undefined);
  }, [filters]);

  const mergedLocationIds = React.useMemo(() => {
    const ids = [...(filters.locationIds ?? []), ...(columnLocationIds ?? [])];
    return ids.length ? [...new Set(ids)] : undefined;
  }, [filters.locationIds, columnLocationIds]);

  const mergedJobRoleTypeIds = React.useMemo(() => {
    const ids = [...(filters.jobRoleTypeIds ?? []), ...(columnJobRoleTypeIds ?? [])];
    return ids.length ? [...new Set(ids)] : undefined;
  }, [filters.jobRoleTypeIds, columnJobRoleTypeIds]);

  const mergedSpecializationIds = React.useMemo(() => {
    const ids = [...(filters.specializationIds ?? []), ...(columnSpecializationIds ?? [])];
    return ids.length ? [...new Set(ids)] : undefined;
  }, [filters.specializationIds, columnSpecializationIds]);

  const listParams = React.useMemo((): Omit<GetCandidatesParams, 'page' | 'pageSize'> => {
    return {
      q: search ?? filters.q,
      statuses: filters.statuses as GetCandidatesStatusesItem[] | undefined,
      industryIds: filters.industryIds,
      jobRoleTypeIds: mergedJobRoleTypeIds,
      specializationIds: mergedSpecializationIds,
      locationIds: mergedLocationIds,
      firstName,
      lastName,
      currentSalary,
      expectedSalary,
      sortBy,
      sortOrder,
    };
  }, [
    search,
    filters.q,
    filters.statuses,
    filters.industryIds,
    mergedJobRoleTypeIds,
    mergedSpecializationIds,
    mergedLocationIds,
    firstName,
    lastName,
    currentSalary,
    expectedSalary,
    sortBy,
    sortOrder,
  ]);

  const { data, isLoading, isFetching, isError, error } = useGetCandidates(
    {
      page,
      pageSize: PAGE_SIZE,
      ...listParams,
    },
    // Keep the previous page's rows while the next one loads — infinite
    // scroll otherwise flashes the whole list back to a loading skeleton
    // every time the sentinel row requests another batch.
    { query: { placeholderData: keepPreviousData } },
  );
  const result = data?.status === 200 ? data.data : undefined;
  const candidates = useInfinitePages(result?.data, page, isFetching);
  const total = result?.total ?? 0;

  function handleSelectionChange(rows: Candidate[]) {
    setSelected(rows);
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
    // affects latency, so batching a handful of requests in flight at once
    // is the actual lever.
    const CONCURRENCY = 5;
    const all: Candidate[] = [];
    for (let batchStart = 1; batchStart <= pageCount; batchStart += CONCURRENCY) {
      const batch = Array.from({ length: Math.min(CONCURRENCY, pageCount - batchStart + 1) }, (_, i) => batchStart + i);
      const results = await Promise.all(
        batch.map((p) =>
          getCandidates({
            page: p,
            pageSize: fetchPageSize,
            ...listParams,
          }),
        ),
      );
      for (const res of results) {
        if (res.status === 200) all.push(...res.data.data);
      }
    }
    setSelected(all.slice(0, capped));
    setSelectAllMode(true);
    setIsSelectingAll(false);
  }

  function handleClearSelection() {
    setSelected([]);
    setSelectAllMode(false);
  }

  function handleQueryChange({ search: nextSearch, columnFilters, sorting }: DataGridQuery) {
    const locationFilter = columnFilters.find((f) => f.id === 'location')?.value as string[] | undefined;
    const jobRoleFilter = columnFilters.find((f) => f.id === 'jobRoleType')?.value as string[] | undefined;
    const specializationFilter = columnFilters.find((f) => f.id === 'specialization')?.value as
      | string[]
      | undefined;
    const firstNameFilter = columnFilters.find((f) => f.id === 'firstName')?.value as string[] | undefined;
    const lastNameFilter = columnFilters.find((f) => f.id === 'lastName')?.value as string[] | undefined;
    const currentSalaryFilter = columnFilters.find((f) => f.id === 'currentSalary')?.value as
      | string[]
      | undefined;
    const expectedSalaryFilter = columnFilters.find((f) => f.id === 'expectedSalary')?.value as
      | string[]
      | undefined;

    const sort = sorting[0];
    const sortField = sort && sort.id in GetCandidatesSortBy ? (sort.id as GetCandidatesSortBy) : undefined;

    setColumnLocationIds(locationFilter?.length ? locationFilter : undefined);
    setColumnJobRoleTypeIds(jobRoleFilter?.length ? jobRoleFilter : undefined);
    setColumnSpecializationIds(specializationFilter?.length ? specializationFilter : undefined);
    setFirstName(firstNameFilter?.[0]?.trim() || undefined);
    setLastName(lastNameFilter?.[0]?.trim() || undefined);
    setCurrentSalary(currentSalaryFilter?.[0]?.trim() || undefined);
    setExpectedSalary(expectedSalaryFilter?.[0]?.trim() || undefined);
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setSearch(nextSearch.trim() || undefined);
    setPage(1);
  }

  const candidateFilters: DataGridFilter[] = React.useMemo(
    () => [
      {
        columnId: 'location',
        title: 'City Coverage',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <LocationFilterButton
            selected={selected}
            onChange={onChange}
            level="CITY_COVERAGE"
            compact
            title="City Coverage"
            labelFor={(id) => locationNames[id] ?? id}
            onResolve={registerLocationName}
          />
        ),
        labelFor: (id) => locationNames[id] ?? id,
      },
      {
        columnId: 'jobRoleType',
        title: 'Role Type',
        options: jobRoleTypeOptions,
        inHeader: true,
      },
      {
        columnId: 'specialization',
        title: 'Specialization',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <SpecializationFilterButton
            selected={selected}
            onChange={onChange}
            compact
            title="Specialization"
            labelFor={(id) => specializationNames[id] ?? id}
            onResolve={registerSpecializationName}
            industryIds={filters.industryIds}
          />
        ),
        labelFor: (id) => specializationNames[id] ?? id,
      },
      {
        columnId: 'firstName',
        title: 'First Name',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <TextFilter
            title="First Name"
            compact
            value={selected[0]}
            onChange={(v) => onChange(v ? [v] : [])}
            placeholder="Contains…"
          />
        ),
        labelFor: (v) => v,
      },
      {
        columnId: 'lastName',
        title: 'Family Name',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <TextFilter
            title="Family Name"
            compact
            value={selected[0]}
            onChange={(v) => onChange(v ? [v] : [])}
            placeholder="Contains…"
          />
        ),
        labelFor: (v) => v,
      },
      {
        columnId: 'currentSalary',
        title: 'Salary Current',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <TextFilter
            title="Salary Current"
            compact
            value={selected[0]}
            onChange={(v) => onChange(v ? [v] : [])}
            placeholder="Contains…"
          />
        ),
        labelFor: (v) => v,
      },
      {
        columnId: 'expectedSalary',
        title: 'Salary Expected',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <TextFilter
            title="Salary Expected"
            compact
            value={selected[0]}
            onChange={(v) => onChange(v ? [v] : [])}
            placeholder="Contains…"
          />
        ),
        labelFor: (v) => v,
      },
    ],
    [
      locationNames,
      specializationNames,
      registerLocationName,
      registerSpecializationName,
      jobRoleTypeOptions,
      filters.industryIds,
    ],
  );

  // Bypasses a single-mutation hook (which only tracks one in-flight call at
  // a time) — bulk fires several concurrent requests, and we want a single
  // summary toast, not one per row.
  async function handleBulkSetStatus(nextStatus: CandidateStatus) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selected.map((c) => updateCandidate(c.id, { status: nextStatus })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
    if (succeeded > 0) {
      toast.success(`Marked ${succeeded} candidate${succeeded === 1 ? '' : 's'} as ${candidateStatusLabels[nextStatus]}`);
    }
    if (failed > 0) toast.error(`Failed for ${failed} candidate${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    handleClearSelection();
  }

  // Routes through the server (not an in-browser xlsx build) so formatting
  // stays in one place and scope is re-checked on every export — a selection
  // exports exactly those rows; no selection exports everything matching the
  // current filters, unbounded.
  async function handleExport() {
    setIsExporting(true);
    // A loading toast, not just the isExporting-driven button label — this
    // is triggered from a DropdownMenuItem, and the dropdown closes the
    // instant it's clicked, so a label change on that now-unmounted item is
    // never actually seen. The toast (same `id` as the success/error below,
    // so it morphs in place rather than stacking) is what's actually visible
    // while an unbounded, potentially-slow export is in flight.
    toast.loading('Exporting…', { id: 'export-candidates' });
    // The server has no ambient concept of "the viewer's timezone" — it only
    // ever sees UTC timestamps, so date/time export columns need this sent
    // along explicitly.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (selected.length > 0) {
        await downloadFile(getExportCandidatesByIdsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected.map((c) => c.id), timezone }),
        });
      } else {
        await downloadFile(
          getExportCandidatesUrl({
            ...listParams,
            timezone,
          }),
        );
      }
      toast.success('Export ready', { id: 'export-candidates' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: 'export-candidates' });
    } finally {
      setIsExporting(false);
    }
  }

  function handleBulkDelete() {
    setDeleteConfirmOpen(false);
    const toDelete = selected;
    const label = `${toDelete.length} candidate${toDelete.length === 1 ? '' : 's'}`;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
    // Candidate has a real soft-delete/restore endpoint — restore mode:
    // delete fires immediately, Undo calls restore, so it's a genuine
    // reversal rather than a cancelled timer.
    deleteWithUndo({
      label,
      deleteFn: async () => {
        const results = await Promise.allSettled(toDelete.map((c) => deleteCandidate(c.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`Failed to delete ${failed} of ${toDelete.length} candidates`);
      },
      restoreFn: async () => {
        await Promise.allSettled(toDelete.map((c) => restoreCandidate(c.id)));
      },
      onCommitted: invalidate,
      onUndo: invalidate,
    });
    handleClearSelection();
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load candidates: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  const isConsultant = session?.user?.roleName === 'consultant';
  const scopeGrants =
    (session?.user?.industryIds?.length ?? 0) +
    (session?.user?.locationIds?.length ?? 0) +
    (session?.user?.specializationIds?.length ?? 0);
  const allLoadedRowsSelected = selected.length > 0 && selected.length === candidates.length;

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
          <span className="font-medium">{selected.length.toLocaleString()} candidates selected (every match)</span>
          <button type="button" onClick={handleClearSelection} className="text-muted-foreground hover:text-foreground">
            Clear selection
          </button>
        </div>
      ) : null}

      <DataGrid
        newRow={newRow}
        columns={candidateColumns}
        data={candidates}
        isLoading={isLoading}
        isFetching={isFetching}
        searchPlaceholder="Search candidates…"
        columnSizingKey="candidates"
        filters={candidateFilters}
        getRowId={(c) => c.id}
        onRowClick={(candidate) => router.push(`/candidates/${candidate.id}`)}
        onSelectionChange={handleSelectionChange}
        enableRowRangeSelect
        hideSelectColumn
        emptyState={
          total === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-4 text-center">
              <p className="font-medium">No candidates match these filters.</p>
              {mergedSpecializationIds?.length ? (
                <p className="text-sm text-muted-foreground">
                  Specialization is only tagged on ~5% of candidates — try removing it above.
                </p>
              ) : isConsultant && scopeGrants === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have any industry, location or specialization grants configured — you&apos;ll only see
                  candidates directly assigned to you until that&apos;s set up.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Try removing a filter above.</p>
              )}
            </div>
          ) : (
            'No candidates match these filters.'
          )
        }
        toolbar={
          <div className="flex items-center gap-2">
            {canCreate && canUpdate ? (
              <ImportDialog
                entityLabel="Candidates"
                templateUrl={getGetCandidateImportTemplateUrl()}
                upload={async (file, commit) => {
                  const res = await importCandidates.mutateAsync({ data: { file, commit } });
                  if (res.status !== 201) throw new Error('Import failed');
                  return res.data;
                }}
                onImported={() => queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() })}
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
                          <Tag />
                          Set status
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-48">
                          {candidateStatuses.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => handleBulkSetStatus(s)}>
                              <Badge variant={candidateStatusVariants[s]}>{candidateStatusLabels[s]}</Badge>
                            </DropdownMenuItem>
                          ))}
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
                  <Tag />
                  Set status
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-48">
                  {candidateStatuses.map((s) => (
                    <ContextMenuItem key={s} onClick={() => handleBulkSetStatus(s)}>
                      <Badge variant={candidateStatusVariants[s]}>{candidateStatusLabels[s]}</Badge>
                    </ContextMenuItem>
                  ))}
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
          total,
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
        title={`Delete ${selected.length} candidate${selected.length === 1 ? '' : 's'}?`}
        description="Archived (soft delete) — you can undo this from the toast right after."
        onConfirm={handleBulkDelete}
      />
    </>
  );
}
