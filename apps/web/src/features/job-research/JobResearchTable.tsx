'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { ChevronDown, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenuItem } from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClientFilterButton } from '@/components/ClientFilterButton';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { JobTitleFilterButton } from '@/components/JobTitleFilterButton';
import { LocationFilterButton } from '@/components/LocationMultiSelect';
import { TextFilter } from '@/components/TextFilter';
import {
  getGetJobTitlesQueryKey,
  useCreateJobTitle,
} from '@/lib/api/generated/job-titles/job-titles';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import { downloadFile } from '@/lib/api/fetcher';
import {
  createJobResearch as createJobResearchRequest,
  getExportJobResearchByIdsUrl,
  getExportJobResearchUrl,
  getGetJobResearchQueryKey,
  useGetJobResearch,
} from '@/lib/api/generated/job-research/job-research';
import { GetJobResearchSortBy } from '@/lib/api/generated/types/getJobResearchSortBy';
import type {
  CreateJobResearchDto,
  ExportJobResearchSortBy,
  ExportJobResearchSortOrder,
  ExportJobResearchStatusesItem,
  GetJobResearchSortOrder,
  GetJobResearchStatusesItem,
} from '@/lib/api/generated/types';
import { useJobResearchNewRow } from './JobResearchNewRow';
import { getJobResearchColumns } from './columns';
import type { JobResearch, JobResearchAppliedFilters } from './schema';

const PAGE_SIZE = 50;

export function JobResearchTable({
  filters,
}: {
  /** Committed from the search gate; column header filters merge on top. */
  filters: JobResearchAppliedFilters;
}) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [sortBy, setSortBy] = React.useState<GetJobResearchSortBy | undefined>(filters.sortBy);
  const [sortOrder, setSortOrder] = React.useState<GetJobResearchSortOrder>(filters.sortOrder ?? 'desc');
  const [selected, setSelected] = React.useState<JobResearch[]>([]);
  const [isExporting, setIsExporting] = React.useState(false);
  const queryClient = useQueryClient();

  // Column-header filters (in addition to gate locationIds / industry / etc.).
  const [columnLocationIds, setColumnLocationIds] = React.useState<string[] | undefined>();
  const [jobTitleIds, setJobTitleIds] = React.useState<string[] | undefined>();
  const [clientIds, setClientIds] = React.useState<string[] | undefined>();
  const [salaryRange, setSalaryRange] = React.useState<string | undefined>();

  const [locationNames, setLocationNames] = React.useState<Record<string, string>>({});
  const registerLocationName = React.useCallback(
    (id: string, name: string) =>
      setLocationNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [clientNames, setClientNames] = React.useState<Record<string, string>>({});
  const registerClientName = React.useCallback(
    (id: string, name: string) =>
      setClientNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [jobTitleNames, setJobTitleNames] = React.useState<Record<string, string>>({});
  const registerJobTitleName = React.useCallback(
    (id: string, name: string) =>
      setJobTitleNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );

  const createJobTitle = useCreateJobTitle();

  async function handleCreateJobTitle(name: string) {
    try {
      const res = await createJobTitle.mutateAsync({ data: { name } });
      if (res.status !== 201) throw new Error('Failed to add job title');
      queryClient.invalidateQueries({ queryKey: getGetJobTitlesQueryKey() });
      return res.data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add job title');
      throw err;
    }
  }

  async function handleCreateJobResearch(dto: CreateJobResearchDto) {
    try {
      const res = await createJobResearchRequest(dto);
      if (res.status !== 201) throw new Error('Failed to create research row');
      setPage(1);
      queryClient.invalidateQueries({ queryKey: getGetJobResearchQueryKey() });
      toast.success('Research row added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create research row');
      throw err;
    }
  }

  const selectionOrderRef = React.useRef<string[]>([]);
  function handleSelectionChange(rows: JobResearch[]) {
    const ids = new Set(rows.map((r) => r.id));
    selectionOrderRef.current = selectionOrderRef.current.filter((id) => ids.has(id));
    for (const row of rows) if (!selectionOrderRef.current.includes(row.id)) selectionOrderRef.current.push(row.id);
    setSelected(rows);
  }

  // Fresh gate View: reset pagination/sort and clear column filters so a new
  // gate commit isn't mixed with stale header filters from the prior search.
  React.useEffect(() => {
    setPage(1);
    setSortBy(filters.sortBy);
    setSortOrder(filters.sortOrder ?? 'desc');
    setColumnLocationIds(undefined);
    setJobTitleIds(undefined);
    setClientIds(undefined);
    setSalaryRange(undefined);
  }, [filters]);

  const mergedLocationIds = React.useMemo(() => {
    const ids = [...(filters.locationIds ?? []), ...(columnLocationIds ?? [])];
    return ids.length ? [...new Set(ids)] : undefined;
  }, [filters.locationIds, columnLocationIds]);

  const { data, isLoading, isFetching, isError, error } = useGetJobResearch(
    {
      page,
      pageSize: PAGE_SIZE,
      q: search,
      statuses: filters.statuses as GetJobResearchStatusesItem[] | undefined,
      industryIds: filters.industryIds,
      specializationIds: filters.specializationIds,
      locationIds: mergedLocationIds,
      clientIds,
      jobTitleIds,
      salaryRange,
      sortBy,
      sortOrder,
    },
    { query: { placeholderData: keepPreviousData } },
  );
  const result = data?.status === 200 ? data.data : undefined;
  const rows = useInfinitePages(result?.data, page, isFetching);

  function handleQueryChange({ search: nextSearch, columnFilters, sorting }: DataGridQuery) {
    const locationFilter = columnFilters.find((f) => f.id === 'location')?.value as
      string[] | undefined;
    const jobTitleFilter = columnFilters.find((f) => f.id === 'jobTitle')?.value as
      string[] | undefined;
    const clientFilter = columnFilters.find((f) => f.id === 'client')?.value as string[] | undefined;
    const salaryFilter = columnFilters.find((f) => f.id === 'salaryRange')?.value as
      string[] | undefined;

    const sort = sorting[0];
    const sortField =
      sort && sort.id in GetJobResearchSortBy ? (sort.id as GetJobResearchSortBy) : undefined;

    setColumnLocationIds(locationFilter?.length ? locationFilter : undefined);
    setJobTitleIds(jobTitleFilter?.length ? jobTitleFilter : undefined);
    setClientIds(clientFilter?.length ? clientFilter : undefined);
    setSalaryRange(salaryFilter?.[0]?.trim() || undefined);
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setSearch(nextSearch.trim() || undefined);
    setPage(1);
  }

  const researchFilters: DataGridFilter[] = React.useMemo(
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
        columnId: 'jobTitle',
        title: 'Job Title',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <JobTitleFilterButton
            selected={selected}
            onChange={onChange}
            onResolve={registerJobTitleName}
            labelFor={(id) => jobTitleNames[id] ?? id}
            title="Job Title"
          />
        ),
        labelFor: (id) => jobTitleNames[id] ?? id,
      },
      {
        columnId: 'client',
        title: 'Company',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <ClientFilterButton
            selected={selected}
            onChange={onChange}
            onResolve={registerClientName}
            labelFor={(id) => clientNames[id] ?? id}
            title="Company"
          />
        ),
        labelFor: (id) => clientNames[id] ?? id,
      },
      {
        columnId: 'salaryRange',
        title: 'Salary',
        options: [],
        inHeader: true,
        render: ({ selected, onChange }) => (
          <TextFilter
            title="Salary"
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
      clientNames,
      jobTitleNames,
      registerLocationName,
      registerClientName,
      registerJobTitleName,
    ],
  );

  async function handleExport() {
    setIsExporting(true);
    toast.loading('Exporting…', { id: 'export-job-research' });
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
            q: search,
            statuses: filters.statuses as unknown as ExportJobResearchStatusesItem[] | undefined,
            industryIds: filters.industryIds,
            specializationIds: filters.specializationIds,
            locationIds: mergedLocationIds,
            clientIds,
            jobTitleIds,
            salaryRange,
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

  function handleEnrichStakeholders() {
    const clientIdByRowId = new Map(selected.map((r) => [r.id, r.clientId]));
    const enrichClientIds: string[] = [];
    for (const rowId of selectionOrderRef.current) {
      const clientId = clientIdByRowId.get(rowId);
      if (clientId && !enrichClientIds.includes(clientId)) enrichClientIds.push(clientId);
    }
    router.push(
      `/stakeholders/enrich?clientIds=${encodeURIComponent(enrichClientIds.join(','))}&from=job-opening-search`,
    );
  }

  const columns = React.useMemo(() => getJobResearchColumns(), []);

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load job orders: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  const newRow = useJobResearchNewRow({
    onCreateJobTitle: handleCreateJobTitle,
    onCreate: handleCreateJobResearch,
    disabled: false,
  });

  return (
    <DataGrid
      columns={columns}
      newRow={newRow}
      data={rows}
      isLoading={isLoading}
      isFetching={isFetching}
      searchPlaceholder="Search job research…"
      filters={researchFilters}
      columnSizingKey="job-research"
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
