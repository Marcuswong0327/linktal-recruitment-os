'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { getGetJobOrdersQueryKey, useGetJobOrders, useUpdateJobOrder } from '@/lib/api/generated/job-orders/job-orders';
import type { ConsultantEntity, GetJobOrdersStatus } from '@/lib/api/generated/types';
import { getJobOrderColumns, priorityVariant, statusVariant } from './columns';
import { type JobOrder, type JobOrderStatus, jobOrderStatusLabels, jobOrderStatuses, priorityLabels } from './schema';

const PAGE_SIZE = 20;

const statusOptions = jobOrderStatuses.map((value) => ({
  value,
  label: jobOrderStatusLabels[value],
  variant: statusVariant[value],
}));

const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({
  value,
  label,
  variant: priorityVariant[Number(value)],
}));

const jobOrderFilters: DataGridFilter[] = [
  { columnId: 'status', title: 'Status', single: true, options: statusOptions },
  { columnId: 'priorityLevel', title: 'Priority', single: true, options: priorityOptions },
];

export function JobOrdersTable({ canCreate = true }: { canCreate?: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState<GetJobOrdersStatus | undefined>();
  const [priorityLevel, setPriorityLevel] = React.useState<number | undefined>();
  const [editing, setEditing] = React.useState<JobOrder | null>(null);

  const { data, isLoading, isError, error } = useGetJobOrders(
    { page, pageSize: PAGE_SIZE, q: search, status, priorityLevel },
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
  const consultantName = React.useCallback(
    (id: string | null) => (id ? (consultants.find((c) => c.id === id)?.fullName ?? 'Unknown') : 'Unassigned'),
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
    setSearch(search.trim() || undefined);
    setStatus(statusFilter?.[0] as GetJobOrdersStatus | undefined);
    setPriorityLevel(priorityFilter?.[0] === undefined ? undefined : Number(priorityFilter[0]));
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

  const columns = React.useMemo(() => getJobOrderColumns({ clientName, consultantName }), [clientName, consultantName]);

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
        toolbar={
          <Button
            size="lg"
            // disabled={!canCreate}
            disabled={true}
            title={canCreate ? undefined : "You don't have permission to add job orders"}
          >
            <Plus />
            Add Job Order
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

function EditJobOrderForm({
  jobOrder,
  clients,
  consultants,
  isSaving,
  onSave,
  onCancel,
}: {
  jobOrder: JobOrder;
  clients: { id: string; companyName: string }[];
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

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.companyName }));
  const consultantOptions = [
    { value: '', label: 'Unassigned' },
    ...consultants.map((c) => ({ value: c.id, label: c.fullName })),
  ];

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
          <EnumSelect id="jo-client" value={clientId} onValueChange={setClientId} options={clientOptions} />
        </FormField>
        <FormField label="Consultant" htmlFor="jo-consultant">
          <EnumSelect
            id="jo-consultant"
            value={consultantId}
            onValueChange={setConsultantId}
            options={consultantOptions}
            placeholder="Unassigned"
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
            options={jobOrderStatuses.map((value) => ({ value, label: jobOrderStatusLabels[value] }))}
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
