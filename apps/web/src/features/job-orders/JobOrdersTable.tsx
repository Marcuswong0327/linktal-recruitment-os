'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Download, Plus, Rocket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Combobox } from '@base-ui/react/combobox';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { ImportDialog } from '@/components/ImportDialog';
import {
  ConsultantComboboxPopup,
  ConsultantFilterButton,
  useConsultantLookup,
} from '@/components/ConsultantCombobox';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { downloadFile } from '@/lib/api/fetcher';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import {
  deleteJobOrder as deleteJobOrderRequest,
  getExportJobOrdersByIdsUrl,
  getExportJobOrdersUrl,
  getGetJobOrderImportTemplateUrl,
  getGetJobOrdersQueryKey,
  setJobOrderConsultants as setJobOrderConsultantsRequest,
  updateJobOrder as updateJobOrderRequest,
  useGetJobOrders,
  useImportJobOrders,
} from '@/lib/api/generated/job-orders/job-orders';
import type {
  ConsultantEntity,
  GetJobOrdersSortBy,
  GetJobOrdersSortOrder,
  GetJobOrdersStatusesItem,
  UpdateJobOrderDto,
} from '@/lib/api/generated/types';
import { getJobOrderColumns } from './columns';
import {
  type JobOrder,
  jobOrderQualities,
  jobOrderQualityLabels,
  jobOrderStatusLabels,
  jobOrderStatuses,
  priorityLabels,
  priorityOptions,
  priorityVariant,
  qualityVariant,
  statusOptions,
  statusVariant,
} from './schema';

const PAGE_SIZE = 20;

export function JobOrdersTable({
  canCreate = true,
  canUpdate = true,
  canDelete = true,
}: {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [statuses, setStatuses] = React.useState<GetJobOrdersStatusesItem[] | undefined>();
  const [priorityLevels, setPriorityLevels] = React.useState<number[] | undefined>();
  const [consultantIds, setConsultantIds] = React.useState<string[] | undefined>();
  const [sortBy, setSortBy] = React.useState<GetJobOrdersSortBy | undefined>();
  const [sortOrder, setSortOrder] = React.useState<GetJobOrdersSortOrder | undefined>();
  const [selectedJobOrders, setSelectedJobOrders] = React.useState<JobOrder[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const importJobOrders = useImportJobOrders();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [consultantPickerOpen, setConsultantPickerOpen] = React.useState(false);
  const bulkActionsTriggerRef = React.useRef<HTMLButtonElement>(null);

  const { data, isLoading, isFetching, isError, error } = useGetJobOrders(
    { page, pageSize: PAGE_SIZE, q: search, statuses, priorityLevels, consultantIds, sortBy, sortOrder },
    { query: { placeholderData: keepPreviousData } },
  );

  // Client-side join: the API returns clientId only, so this resolves it once
  // for the table.
  const { data: clientsData } = useGetClients({ pageSize: 100 });
  const clients = clientsData?.status === 200 ? clientsData.data.data : [];
  const clientName = React.useCallback(
    (id: string) => clients.find((c) => c.id === id)?.companyName ?? 'Unknown client',
    [clients],
  );

  // pageSize is capped at 100 server-side (query-consultants.dto.ts) — this
  // is a single unpaginated fetch, so if consultant headcount ever exceeds
  // 100, the overflow silently won't appear here, including as options in
  // the filter and the bulk "Add consultant" picker below.
  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  const consultantFilterOptions = React.useMemo(
    () => consultants.map((c) => ({ value: c.id, label: c.fullName })),
    [consultants],
  );

  // Filters render inside their column's header (2.1) instead of a toolbar
  // row, and every one is multi-select — the API takes arrays for all four.
  // Consultant matches through the JobOrderConsultant join now — any of the
  // selected consultants being on a job order's list is a match.
  const jobOrderFilters: DataGridFilter[] = React.useMemo(
    () => [
      { columnId: 'status', title: 'Status', options: statusOptions, inHeader: true },
      { columnId: 'priorityLevel', title: 'Priority', options: priorityOptions, inHeader: true },
      {
        columnId: 'consultants',
        title: 'Consultant',
        options: consultantFilterOptions,
        inHeader: true,
        // Searchable, avatar-rowed popup instead of a plain checkbox list —
        // same ConsultantFilterButton used for the roster already fetched
        // here, matching the Location/Specialization filters on the
        // Companies table (see CompaniesTable's use of LocationFilterButton/
        // SpecializationFilterButton).
        render: ({ selected, onChange }) => (
          <ConsultantFilterButton selected={selected} onChange={onChange} consultants={consultants} title="Consultant" />
        ),
      },
    ],
    [consultantFilterOptions, consultants],
  );

  const result = data?.status === 200 ? data.data : undefined;
  const jobOrders = result?.data ?? [];

  function handleQueryChange({ search, columnFilters, sorting }: DataGridQuery) {
    const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as
      string[] | undefined;
    const priorityFilter = columnFilters.find((f) => f.id === 'priorityLevel')?.value as
      string[] | undefined;
    const consultantFilter = columnFilters.find((f) => f.id === 'consultants')?.value as
      string[] | undefined;
    const sort = sorting[0];
    setSearch(search.trim() || undefined);
    setStatuses(statusFilter?.length ? (statusFilter as GetJobOrdersStatusesItem[]) : undefined);
    setPriorityLevels(priorityFilter?.length ? priorityFilter.map(Number) : undefined);
    setConsultantIds(consultantFilter?.length ? consultantFilter : undefined);
    setSortBy(sort ? (sort.id as GetJobOrdersSortBy) : undefined);
    setSortOrder(sort ? (sort.desc ? 'desc' : 'asc') : undefined);
    setPage(1);
  }

  // Bypasses any single-mutation hook (which only tracks one in-flight call
  // at a time) — bulk fires several concurrent requests, and we want a single
  // summary toast, not one per row.
  async function handleBulkUpdate(data: UpdateJobOrderDto, actionLabel: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(
      selectedJobOrders.map((j) => updateJobOrderRequest(j.id, data)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    if (succeeded > 0)
      toast.success(`${actionLabel} for ${succeeded} job order${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed for ${failed} job order${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelectedJobOrders([]);
  }

  // Adds one consultant to each selected job order's existing list (never
  // replaces it — several consultants can work the same job order
  // concurrently). No scope check: this is the deliberate escape hatch, same
  // as the single-job-order picker on the detail page.
  async function handleBulkAddConsultant(consultantId: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(
      selectedJobOrders.map((j) => {
        const nextIds = Array.from(new Set([...j.consultants.map((c) => c.id), consultantId]));
        return setJobOrderConsultantsRequest(j.id, { consultantIds: nextIds });
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    if (succeeded > 0) toast.success(`Consultant added for ${succeeded} job order${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed for ${failed} job order${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelectedJobOrders([]);
  }

  // Routes through the server (not an in-browser build) so formatting stays
  // in one place and scope is re-checked on every export — mirrors
  // CompaniesTable/StakeholdersTable/CandidatesTable's handleExport.
  async function handleExport() {
    setIsExporting(true);
    // Same loading-toast pattern as every other entity's export — the
    // button itself already stays visible here (not tucked inside a
    // dropdown), but a toast is still the clearer signal for a
    // potentially-slow, unbounded export than a small label change alone.
    toast.loading('Exporting…', { id: 'export-job-orders' });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (selectedJobOrders.length > 0) {
        await downloadFile(getExportJobOrdersByIdsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedJobOrders.map((j) => j.id), timezone }),
        });
      } else {
        await downloadFile(getExportJobOrdersUrl({ q: search, statuses, priorityLevels, consultantIds, timezone }));
      }
      toast.success('Export ready', { id: 'export-job-orders' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: 'export-job-orders' });
    } finally {
      setIsExporting(false);
    }
  }

  function handleBulkDelete() {
    setDeleteConfirmOpen(false);
    const toDelete = selectedJobOrders;
    const label = `${toDelete.length} job order${toDelete.length === 1 ? '' : 's'}`;
    // No restore endpoint for JobOrder — delayed mode: nothing is sent to
    // the server until the undo window elapses, so Undo is exact.
    deleteWithUndo({
      label,
      deleteFn: async () => {
        const results = await Promise.allSettled(toDelete.map((j) => deleteJobOrderRequest(j.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`Failed to delete ${failed} of ${toDelete.length} job orders`);
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() }),
    });
    setSelectedJobOrders([]);
  }

  const columns = React.useMemo(() => getJobOrderColumns({ clientName }), [clientName]);

  // Drag-select is the only way rows get picked (checkboxes stay hidden, same
  // as the Candidates table) — mousedown on a row and drag to range-select,
  // like a spreadsheet. onRowClick still navigates on a plain click; a real
  // drag suppresses it (see DataGrid's enableRowRangeSelect doc).
  function handleSelectionChange(rows: JobOrder[]) {
    setSelectedJobOrders(rows);
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load job orders: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={jobOrders}
        isLoading={isLoading}
        isFetching={isFetching}
        searchPlaceholder="Search job orders…"
        filters={jobOrderFilters}
        // Size to actual content instead of stretching to fill leftover
        // viewport height when there aren't enough rows — see DataGrid's
        // fillHeight doc.
        fillHeight={false}
        // Job Order info isn't directly editable from the main sheet (2.2) —
        // every row (not just the title link) opens the dedicated page.
        onRowClick={(jobOrder) => router.push(`/job-orders/${jobOrder.id}`)}
        emptyState="No job orders yet. Create one against a client to get started."
        getRowId={(j) => j.id}
        enableRowRangeSelect
        hideSelectColumn
        onSelectionChange={handleSelectionChange}
        toolbar={
          <div className="flex animate-in items-center gap-2 fade-in-0 duration-200">
            <Button size="lg" variant="outline" onClick={handleExport} disabled={isExporting}>
              <Download />
              {isExporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
            {canCreate && canUpdate ? (
              <ImportDialog
                entityLabel="Job Orders"
                templateUrl={getGetJobOrderImportTemplateUrl()}
                upload={async (file, commit) => {
                  const res = await importJobOrders.mutateAsync({ data: { file, commit } });
                  if (res.status !== 201) throw new Error('Import failed');
                  return res.data;
                }}
                onImported={() => queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() })}
              />
            ) : null}
            {selectedJobOrders.length > 0 ? (
              <>
                <Button
                  variant="destructive"
                  size="lg"
                  disabled={!canDelete}
                  title={canDelete ? undefined : "You don't have permission to delete job orders"}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                  Delete
                </Button>
                <ConfirmDeleteDialog
                  open={deleteConfirmOpen}
                  onOpenChange={setDeleteConfirmOpen}
                  title={`Delete ${selectedJobOrders.length} job order${selectedJobOrders.length === 1 ? '' : 's'}?`}
                  description="You can undo this from the toast right after, or it's gone for good."
                  onConfirm={handleBulkDelete}
                />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button ref={bulkActionsTriggerRef} size="lg" disabled={isBulkUpdating}>
                        {isBulkUpdating ? 'Updating…' : `Bulk actions (${selectedJobOrders.length})`}
                        <ChevronDown />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Set status</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {jobOrderStatuses.map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() =>
                              handleBulkUpdate({ status: s }, `Marked ${jobOrderStatusLabels[s]}`)
                            }
                          >
                            <Badge variant={statusVariant[s]}>{jobOrderStatusLabels[s]}</Badge>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Set quality</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {jobOrderQualities.map((q) => (
                          <DropdownMenuItem
                            key={q}
                            onClick={() =>
                              handleBulkUpdate(
                                { quality: q },
                                `Set to ${jobOrderQualityLabels[q]} quality`,
                              )
                            }
                          >
                            <Badge variant={qualityVariant[q]}>{jobOrderQualityLabels[q]}</Badge>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Set priority</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {Object.entries(priorityLabels).map(([value, label]) => (
                          <DropdownMenuItem
                            key={value}
                            onClick={() =>
                              handleBulkUpdate(
                                { priorityLevel: Number(value) },
                                `Set to ${label} priority`,
                              )
                            }
                          >
                            <Badge variant={priorityVariant[Number(value)]}>{label}</Badge>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem onClick={() => setConsultantPickerOpen(true)}>
                      Add consultant
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Anchored to the trigger above — a live search inside a Menu's own
                    roving-focus popup isn't a supported composition, so this opens as
                    its own popup right where "Add consultant" was clicked. No
                    industry/location restriction on who's offered here — adding
                    someone outside their usual scope is the deliberate point of
                    this feature (see PUT /job-orders/:id/consultants). */}
                <BulkConsultantPicker
                  anchorRef={bulkActionsTriggerRef}
                  open={consultantPickerOpen}
                  onOpenChange={setConsultantPickerOpen}
                  consultants={consultants}
                  onAssign={handleBulkAddConsultant}
                />
              </>
            ) : null}
          </div>
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

      {/* Bottom-of-sheet, not the toolbar (2.1) — Adding is a navigation to
          the dedicated create page (2.2), not an inline quick-add. */}
      <div className="flex justify-center gap-3">
        {canCreate ? (
          <Button size="lg" nativeButton={false} render={<Link href="/job-orders/new" />}>
            <Plus />
            Add Job Order
          </Button>
        ) : (
          <Button size="lg" disabled title="You don't have permission to add job orders">
            <Plus />
            Add Job Order
          </Button>
        )}

        {/* 2.5: choose between our own stakeholder contacts or Seek to
            go find more clients. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="lg" variant="outline">
                <Rocket />
                Business Development
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => router.push('/stakeholders')}>
              Stakeholders (our database)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.open('https://www.seek.com.au', '_blank', 'noopener,noreferrer')}
            >
              Seek
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

/**
 * Bulk consultant picker reached via the "Set consultant" item in the Bulk
 * actions menu. A live search doesn't compose safely inside a Menu's own
 * roving-focus popup, so this is a separate, fully-controlled Combobox with
 * no trigger of its own — it's anchored to the Bulk actions button and opened
 * externally, so visually it reads as part of that one menu.
 */
function BulkConsultantPicker({
  anchorRef,
  open,
  onOpenChange,
  consultants,
  onAssign,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultants: ConsultantEntity[];
  onAssign: (consultantId: string) => void;
}) {
  const { byId, items, labelFor, searchTextFor } = useConsultantLookup(consultants);

  return (
    <Combobox.Root
      items={items}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={(next) => {
        if (next != null) {
          onAssign(next);
          onOpenChange(false);
        }
      }}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(consultantId) => consultantId}
    >
      <ConsultantComboboxPopup byId={byId} labelFor={labelFor} anchor={anchorRef} />
    </Combobox.Root>
  );
}
