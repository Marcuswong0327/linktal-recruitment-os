'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronDown, Plus, Rocket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import {
  ConsultantComboboxPopup,
  useConsultantLookup,
} from '@/components/ConsultantCombobox';
import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import {
  deleteJobOrder as deleteJobOrderRequest,
  getGetJobOrdersQueryKey,
  updateJobOrder as updateJobOrderRequest,
  useGetJobOrders,
} from '@/lib/api/generated/job-orders/job-orders';
import type {
  ConsultantEntity,
  GetJobOrdersQualitiesItem,
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
  qualityOptions,
  qualityVariant,
  statusOptions,
  statusVariant,
} from './schema';

const PAGE_SIZE = 20;

export function JobOrdersTable({
  canCreate = true,
  canDelete = true,
}: {
  canCreate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  // Every row is already scoped to this consultant's own job orders (see
  // JobOrdersService.findAll) and the field is redacted server-side too —
  // the column/filter would just repeat their own name (or nothing) on
  // every row. Same reasoning as Companies' `isConsultant` treatment.
  const isConsultant = session?.user?.roleName === 'consultant';
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [statuses, setStatuses] = React.useState<GetJobOrdersStatusesItem[] | undefined>();
  const [qualities, setQualities] = React.useState<GetJobOrdersQualitiesItem[] | undefined>();
  const [priorityLevels, setPriorityLevels] = React.useState<number[] | undefined>();
  const [consultantIds, setConsultantIds] = React.useState<string[] | undefined>();
  const [selectedJobOrders, setSelectedJobOrders] = React.useState<JobOrder[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [consultantPickerOpen, setConsultantPickerOpen] = React.useState(false);
  const bulkActionsTriggerRef = React.useRef<HTMLButtonElement>(null);

  const { data, isLoading, isFetching, isError, error } = useGetJobOrders(
    { page, pageSize: PAGE_SIZE, q: search, statuses, qualities, priorityLevels, consultantIds },
    { query: { placeholderData: keepPreviousData } },
  );

  // Client-side joins: the API returns clientId/consultantId only, so pull
  // both lists once to resolve names for the table.
  const { data: clientsData } = useGetClients({ pageSize: 100 });
  const clients = clientsData?.status === 200 ? clientsData.data.data : [];
  const clientName = React.useCallback(
    (id: string) => clients.find((c) => c.id === id)?.companyName ?? 'Unknown client',
    [clients],
  );

  // pageSize is capped at 100 server-side (query-consultants.dto.ts) — this
  // is a single unpaginated fetch, so if consultant headcount ever exceeds
  // 100, the overflow silently won't appear here, including as options in
  // the single-row and bulk "Set consultant" pickers below.
  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  const consultantName = React.useCallback(
    (id: string | null) => (id ? (consultants.find((c) => c.id === id)?.fullName ?? 'Unknown') : '—'),
    [consultants],
  );

  // Industry-first, for bulk assignment too: a Job Order has no industry of
  // its own, only via its Client — same reasoning as Companies'
  // bulkAssignableConsultants. Only offer consultants who hold *every*
  // distinct industry represented across the selected job orders' clients;
  // any selected job order whose client is untagged makes bulk assignment
  // impossible outright.
  const bulkAssignableConsultants = React.useMemo(() => {
    const selectedClientIndustryIds = selectedJobOrders.map(
      (j) => clients.find((c) => c.id === j.clientId)?.industryId ?? null,
    );
    if (selectedClientIndustryIds.some((id) => !id)) return [];
    const distinctIndustryIds = Array.from(new Set(selectedClientIndustryIds as string[]));
    return consultants.filter(
      (c) => c.industryIds === undefined || distinctIndustryIds.every((id) => c.industryIds!.includes(id)),
    );
  }, [consultants, clients, selectedJobOrders]);

  // For the Candidates column's multi-select picker.
  const { data: candidatesData } = useGetCandidates({ pageSize: 100 });
  const candidates = candidatesData?.status === 200 ? candidatesData.data.data : [];

  const consultantFilterOptions = React.useMemo(
    () => consultants.map((c) => ({ value: c.id, label: c.fullName })),
    [consultants],
  );

  // Filters render inside their column's header (2.1) instead of a toolbar
  // row, and every one is multi-select — the API takes arrays for all four.
  const jobOrderFilters: DataGridFilter[] = React.useMemo(
    () => [
      { columnId: 'status', title: 'Status', options: statusOptions, inHeader: true },
      { columnId: 'quality', title: 'Quality', options: qualityOptions, inHeader: true },
      { columnId: 'priorityLevel', title: 'Priority', options: priorityOptions, inHeader: true },
      ...(isConsultant
        ? []
        : [
            {
              columnId: 'consultantId',
              title: 'Consultant',
              options: consultantFilterOptions,
              inHeader: true,
            },
          ]),
    ],
    [consultantFilterOptions, isConsultant],
  );

  const result = data?.status === 200 ? data.data : undefined;
  const jobOrders = result?.data ?? [];

  function handleQueryChange({ search, columnFilters }: DataGridQuery) {
    const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as
      string[] | undefined;
    const qualityFilter = columnFilters.find((f) => f.id === 'quality')?.value as
      string[] | undefined;
    const priorityFilter = columnFilters.find((f) => f.id === 'priorityLevel')?.value as
      string[] | undefined;
    const consultantFilter = columnFilters.find((f) => f.id === 'consultantId')?.value as
      string[] | undefined;
    setSearch(search.trim() || undefined);
    setStatuses(statusFilter?.length ? (statusFilter as GetJobOrdersStatusesItem[]) : undefined);
    setQualities(qualityFilter?.length ? (qualityFilter as GetJobOrdersQualitiesItem[]) : undefined);
    setPriorityLevels(priorityFilter?.length ? priorityFilter.map(Number) : undefined);
    setConsultantIds(consultantFilter?.length ? consultantFilter : undefined);
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

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    const results = await Promise.allSettled(
      selectedJobOrders.map((j) => deleteJobOrderRequest(j.id)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    if (succeeded > 0) toast.success(`Deleted ${succeeded} job order${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed to delete ${failed} job order${failed === 1 ? '' : 's'}`);
    setIsBulkDeleting(false);
    setSelectedJobOrders([]);
  }

  const columns = React.useMemo(
    () => getJobOrderColumns({ clientName, consultantName, candidates, hideConsultantColumn: isConsultant }),
    [clientName, consultantName, candidates, isConsultant],
  );

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
        // Job Order info isn't directly editable from the main sheet (2.2) —
        // every row (not just the title link) opens the dedicated page.
        onRowClick={(jobOrder) => router.push(`/job-orders/${jobOrder.id}`)}
        emptyState="No job orders yet. Create one against a client to get started."
        getRowId={(j) => j.id}
        toolbar={
          selectedJobOrders.length > 0 ? (
            <div className="flex animate-in items-center gap-2 fade-in-0 duration-200">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="destructive"
                      size="lg"
                      disabled={!canDelete || isBulkDeleting}
                      title={
                        canDelete ? undefined : "You don't have permission to delete job orders"
                      }
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selectedJobOrders.length} job order
                      {selectedJobOrders.length === 1 ? '' : 's'}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the selected job orders and can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

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
                    Set consultant
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Anchored to the trigger above — a live search inside a Menu's own
                  roving-focus popup isn't a supported composition, so this opens as
                  its own popup right where "Set consultant" was clicked. */}
              <BulkConsultantPicker
                anchorRef={bulkActionsTriggerRef}
                open={consultantPickerOpen}
                onOpenChange={setConsultantPickerOpen}
                consultants={bulkAssignableConsultants}
                onAssign={(id) =>
                  // Generated type omits null (API accepts it to clear the FK) —
                  // cast around the gap rather than sending '' which Prisma would
                  // reject as an invalid foreign key.
                  handleBulkUpdate(
                    { consultantId: id || null } as unknown as UpdateJobOrderDto,
                    id ? 'Consultant assigned' : 'Unassigned',
                  )
                }
              />
            </div>
          ) : null
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

        {/* 2.5: choose between the internal Companies database or Seek to
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
            <DropdownMenuItem onClick={() => router.push('/companies')}>
              Companies (our database)
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
