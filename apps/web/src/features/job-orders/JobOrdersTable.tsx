'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ClientCombobox } from '@/components/ClientCombobox';
import { ConsultantCombobox, ConsultantComboboxPopup, useConsultantLookup } from '@/components/ConsultantCombobox';
import { ConsultantFilter } from '@/components/ConsultantFilter';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import {
  deleteJobOrder as deleteJobOrderRequest,
  getGetJobOrdersQueryKey,
  updateJobOrder as updateJobOrderRequest,
  useGetJobOrders,
  useUpdateJobOrder,
} from '@/lib/api/generated/job-orders/job-orders';
import type { ClientEntity, ConsultantEntity, GetJobOrdersStatus, UpdateJobOrderDto } from '@/lib/api/generated/types';
import { getJobOrderColumns } from './columns';
import {
  type JobOrder,
  type JobOrderStatus,
  jobOrderStatusLabels,
  jobOrderStatuses,
  priorityLabels,
  priorityOptions,
  priorityVariant,
  statusOptions,
  statusVariant,
} from './schema';

const PAGE_SIZE = 20;

export function JobOrdersTable({ canCreate = true, canDelete = true }: { canCreate?: boolean; canDelete?: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState<GetJobOrdersStatus | undefined>();
  const [priorityLevel, setPriorityLevel] = React.useState<number | undefined>();
  const [consultantId, setConsultantId] = React.useState<string | undefined>();
  const [editing, setEditing] = React.useState<JobOrder | null>(null);
  const [selectedJobOrders, setSelectedJobOrders] = React.useState<JobOrder[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [consultantPickerOpen, setConsultantPickerOpen] = React.useState(false);
  const bulkActionsTriggerRef = React.useRef<HTMLButtonElement>(null);

  const { data, isLoading, isError, error } = useGetJobOrders(
    { page, pageSize: PAGE_SIZE, q: search, status, priorityLevel, consultantId },
    { query: { placeholderData: keepPreviousData } },
  );

  // Client-side joins: the API returns clientId/consultantId only, so pull
  // both lists once to resolve names for the table and edit form.
  const { data: clientsData } = useGetClients({ pageSize: 100 });
  const clients = clientsData?.status === 200 ? clientsData.data.data : [];
  const clientName = React.useCallback(
    (id: string) => clients.find((c) => c.id === id)?.companyName ?? 'Unknown client',
    [clients],
  );

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  const jobOrderFilters: DataGridFilter[] = React.useMemo(
    () => [
      { columnId: 'status', title: 'Status', single: true, options: statusOptions },
      { columnId: 'priorityLevel', title: 'Priority', single: true, options: priorityOptions },
      {
        columnId: 'consultantId',
        title: 'Consultant',
        single: true,
        render: ({ selected, onChange }) => (
          <ConsultantFilter
            value={selected[0]}
            onValueChange={(v) => onChange(v !== undefined ? [v] : [])}
            consultants={consultants}
          />
        ),
      },
    ],
    [consultants],
  );

  const updateJobOrder = useUpdateJobOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
        toast.success('Saved changes');
        setEditing(null);
      },
      onError: (err) => toast.error(err.message || 'Failed to update job order'),
    },
  });

  const result = data?.status === 200 ? data.data : undefined;
  const jobOrders = result?.data ?? [];

  function handleQueryChange({ search, columnFilters }: DataGridQuery) {
    const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as string[] | undefined;
    const priorityFilter = columnFilters.find((f) => f.id === 'priorityLevel')?.value as string[] | undefined;
    const consultantFilter = columnFilters.find((f) => f.id === 'consultantId')?.value as string[] | undefined;
    setSearch(search.trim() || undefined);
    setStatus(statusFilter?.[0] as GetJobOrdersStatus | undefined);
    setPriorityLevel(priorityFilter?.[0] === undefined ? undefined : Number(priorityFilter[0]));
    setConsultantId(consultantFilter?.[0]);
    setPage(1);
  }

  function handleSave(updated: JobOrder) {
    updateJobOrder.mutate({
      id: updated.id,
      data: {
        jobTitle: updated.jobTitle,
        clientId: updated.clientId,
        consultantId: updated.consultantId ?? undefined,
        department: updated.department ?? undefined,
        location: updated.location ?? undefined,
        jobType: updated.jobType ?? undefined,
        salaryMin: updated.salaryMin ?? undefined,
        salaryMax: updated.salaryMax ?? undefined,
        status: updated.status,
        priorityLevel: updated.priorityLevel ?? undefined,
      },
    });
  }

  // Bypasses the useUpdateJobOrder hook (which only tracks one in-flight call
  // at a time) — bulk fires several concurrent requests, and we want a single
  // summary toast, not one per row.
  async function handleBulkUpdate(data: UpdateJobOrderDto, actionLabel: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selectedJobOrders.map((j) => updateJobOrderRequest(j.id, data)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    if (succeeded > 0) toast.success(`${actionLabel} for ${succeeded} job order${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed for ${failed} job order${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelectedJobOrders([]);
  }

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    const results = await Promise.allSettled(selectedJobOrders.map((j) => deleteJobOrderRequest(j.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    if (succeeded > 0) toast.success(`Deleted ${succeeded} job order${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed to delete ${failed} job order${failed === 1 ? '' : 's'}`);
    setIsBulkDeleting(false);
    setSelectedJobOrders([]);
  }

  const columns = React.useMemo(() => getJobOrderColumns({ clientName, consultants }), [clientName, consultants]);

  if (isError) {
    return <p className="text-sm text-destructive">Failed to load job orders: {error?.message ?? 'Unknown error'}</p>;
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={jobOrders}
        isLoading={isLoading}
        searchPlaceholder="Search job orders…"
        filters={jobOrderFilters}
        onRowClick={setEditing}
        emptyState="No job orders yet. Create one against a client to get started."
        getRowId={(j) => j.id}
        onSelectionChange={setSelectedJobOrders}
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
                      title={canDelete ? undefined : "You don't have permission to delete job orders"}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selectedJobOrders.length} job order{selectedJobOrders.length === 1 ? '' : 's'}?
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
                          onClick={() => handleBulkUpdate({ status: s }, `Marked ${jobOrderStatusLabels[s]}`)}
                        >
                          <Badge variant={statusVariant[s]}>{jobOrderStatusLabels[s]}</Badge>
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
                            handleBulkUpdate({ priorityLevel: Number(value) }, `Set to ${label} priority`)
                          }
                        >
                          <Badge variant={priorityVariant[Number(value)]}>{label}</Badge>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onClick={() => setConsultantPickerOpen(true)}>Set consultant</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Anchored to the trigger above — a live search inside a Menu's own
                  roving-focus popup isn't a supported composition, so this opens as
                  its own popup right where "Set consultant" was clicked. */}
              <BulkConsultantPicker
                anchorRef={bulkActionsTriggerRef}
                open={consultantPickerOpen}
                onOpenChange={setConsultantPickerOpen}
                consultants={consultants}
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
          ) : (
            <Button
              size="lg"
              // disabled={!canCreate}
              disabled={true}
              title={canCreate ? undefined : "You don't have permission to add job orders"}
              className="animate-in fade-in-0 duration-200"
            >
              <Plus />
              Add Job Order
            </Button>
          )
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

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {editing ? (
            <EditJobOrderForm
              key={editing.id}
              jobOrder={editing}
              clients={clients}
              consultants={consultants}
              isSaving={updateJobOrder.isPending}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
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

function EditJobOrderForm({
  jobOrder,
  clients,
  consultants,
  isSaving,
  onSave,
  onCancel,
}: {
  jobOrder: JobOrder;
  clients: ClientEntity[];
  consultants: ConsultantEntity[];
  isSaving: boolean;
  onSave: (jobOrder: JobOrder) => void;
  onCancel: () => void;
}) {
  const [jobTitle, setJobTitle] = React.useState(jobOrder.jobTitle);
  const [clientId, setClientId] = React.useState(jobOrder.clientId);
  const [consultantId, setConsultantId] = React.useState(jobOrder.consultantId ?? '');
  const [department, setDepartment] = React.useState(jobOrder.department ?? '');
  const [location, setLocation] = React.useState(jobOrder.location ?? '');
  const [jobType, setJobType] = React.useState(jobOrder.jobType ?? '');
  const [status, setStatus] = React.useState<JobOrderStatus>(jobOrder.status);
  const [salaryMin, setSalaryMin] = React.useState(jobOrder.salaryMin != null ? String(jobOrder.salaryMin) : '');
  const [salaryMax, setSalaryMax] = React.useState(jobOrder.salaryMax != null ? String(jobOrder.salaryMax) : '');
  const [priorityLevel, setPriorityLevel] = React.useState(
    jobOrder.priorityLevel != null ? String(jobOrder.priorityLevel) : '',
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...jobOrder,
      jobTitle,
      clientId,
      consultantId: consultantId || null,
      department: department || null,
      location: location || null,
      jobType: jobType || null,
      status,
      salaryMin: salaryMin === '' ? null : Number(salaryMin),
      salaryMax: salaryMax === '' ? null : Number(salaryMax),
      priorityLevel: priorityLevel === '' ? null : Number(priorityLevel),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit job order</SheetTitle>
        <SheetDescription>Update the {jobOrder.jobTitle} role.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Role" htmlFor="jo-title">
          <Input id="jo-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </FormField>
        <FormField label="Client" htmlFor="jo-client">
          <ClientCombobox id="jo-client" value={clientId} onValueChange={setClientId} clients={clients} />
        </FormField>
        <FormField label="Consultant" htmlFor="jo-consultant">
          <ConsultantCombobox
            id="jo-consultant"
            value={consultantId}
            onValueChange={setConsultantId}
            consultants={consultants}
          />
        </FormField>
        <FormField label="Department" htmlFor="jo-department">
          <Input id="jo-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </FormField>
        <FormField label="Location" htmlFor="jo-location">
          <Input id="jo-location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </FormField>
        <FormField label="Job type" htmlFor="jo-job-type">
          <Input id="jo-job-type" value={jobType} onChange={(e) => setJobType(e.target.value)} />
        </FormField>
        <FormField label="Status" htmlFor="jo-status">
          <EnumSelect
            id="jo-status"
            value={status}
            onValueChange={(v) => setStatus(v as JobOrderStatus)}
            options={statusOptions}
          />
        </FormField>
        <FormField label="Priority" htmlFor="jo-priority">
          <EnumSelect
            id="jo-priority"
            value={priorityLevel}
            onValueChange={setPriorityLevel}
            options={priorityOptions}
            placeholder="Not set"
          />
        </FormField>
        <FormField label="Salary min" htmlFor="jo-salary-min">
          <Input id="jo-salary-min" type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
        </FormField>
        <FormField label="Salary max" htmlFor="jo-salary-max">
          <Input id="jo-salary-max" type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </SheetFooter>
    </form>
  );
}
