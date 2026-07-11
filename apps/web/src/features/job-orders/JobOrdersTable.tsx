'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DataGrid, type DataGridFilter } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { jobOrderColumns } from './columns';
import { mockJobOrders } from './mock';
import {
  type JobOrder,
  jobOrderStatuses,
  jobOrderStatusLabels,
} from './schema';

const statusOptions = jobOrderStatuses.map((value) => ({
  value,
  label: jobOrderStatusLabels[value],
}));

const jobOrderFilters: DataGridFilter[] = [
  { columnId: 'status', title: 'Status', options: statusOptions },
];

export function JobOrdersTable() {
  const [jobOrders, setJobOrders] = React.useState<JobOrder[]>(mockJobOrders);
  const [editing, setEditing] = React.useState<JobOrder | null>(null);

  function handleSave(updated: JobOrder) {
    setJobOrders((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    setEditing(null);
    toast.success(`Saved changes to ${updated.title}`);
  }

  return (
    <>
      <DataGrid
        columns={jobOrderColumns}
        data={jobOrders}
        searchPlaceholder="Search job orders…"
        filters={jobOrderFilters}
        onRowClick={setEditing}
        emptyState="No job orders yet. Create one against a client to get started."
        toolbar={
          <Button size="lg">
            <Plus />
            Add job order
          </Button>
        }
      />

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <SheetContent className="w-full sm:max-w-md">
          {editing ? (
            <EditJobOrderForm
              key={editing.id}
              jobOrder={editing}
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
  onSave,
  onCancel,
}: {
  jobOrder: JobOrder;
  onSave: (jobOrder: JobOrder) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(jobOrder.title);
  const [company, setCompany] = React.useState(jobOrder.company);
  const [hiringManager, setHiringManager] = React.useState(
    jobOrder.hiringManager,
  );
  const [industry, setIndustry] = React.useState(jobOrder.industry);
  const [location, setLocation] = React.useState(jobOrder.location);
  const [status, setStatus] = React.useState(jobOrder.status);
  const [salaryMin, setSalaryMin] = React.useState(String(jobOrder.salaryMin));
  const [salaryMax, setSalaryMax] = React.useState(String(jobOrder.salaryMax));
  const [feeValue, setFeeValue] = React.useState(String(jobOrder.feeValue));
  const [consultant, setConsultant] = React.useState(jobOrder.consultant);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...jobOrder,
      title,
      company,
      hiringManager,
      industry,
      location,
      status,
      salaryMin: Number(salaryMin) || 0,
      salaryMax: Number(salaryMax) || 0,
      feeValue: Number(feeValue) || 0,
      consultant,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit job order</SheetTitle>
        <SheetDescription>Update the {jobOrder.title} role.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Role" htmlFor="jo-title">
          <Input
            id="jo-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <FormField label="Client" htmlFor="jo-company">
          <Input
            id="jo-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </FormField>
        <FormField label="Hiring manager" htmlFor="jo-manager">
          <Input
            id="jo-manager"
            value={hiringManager}
            onChange={(e) => setHiringManager(e.target.value)}
          />
        </FormField>
        <FormField label="Industry" htmlFor="jo-industry">
          <Input
            id="jo-industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </FormField>
        <FormField label="Location" htmlFor="jo-location">
          <Input
            id="jo-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </FormField>
        <FormField label="Status" htmlFor="jo-status">
          <EnumSelect
            id="jo-status"
            value={status}
            onValueChange={(v) => setStatus(v as JobOrder['status'])}
            options={statusOptions}
          />
        </FormField>
        <FormField label="Salary min" htmlFor="jo-salary-min">
          <Input
            id="jo-salary-min"
            type="number"
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
          />
        </FormField>
        <FormField label="Salary max" htmlFor="jo-salary-max">
          <Input
            id="jo-salary-max"
            type="number"
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
          />
        </FormField>
        <FormField label="Fee value" htmlFor="jo-fee">
          <Input
            id="jo-fee"
            type="number"
            value={feeValue}
            onChange={(e) => setFeeValue(e.target.value)}
          />
        </FormField>
        <FormField label="Consultant" htmlFor="jo-consultant">
          <Input
            id="jo-consultant"
            value={consultant}
            onChange={(e) => setConsultant(e.target.value)}
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg">
          Save changes
        </Button>
      </SheetFooter>
    </form>
  );
}
