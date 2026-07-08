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
import { candidateColumns } from './columns';
import { mockCandidates } from './mock';
import {
  type Candidate,
  candidateStatuses,
  candidateStatusLabels,
} from './schema';

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
}));

const candidateFilters: DataGridFilter[] = [
  { columnId: 'status', title: 'Status', options: statusOptions },
];

export function CandidatesTable() {
  const [candidates, setCandidates] =
    React.useState<Candidate[]>(mockCandidates);
  const [editing, setEditing] = React.useState<Candidate | null>(null);

  function handleSave(updated: Candidate) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
    setEditing(null);
    toast.success(`Saved changes to ${updated.name}`);
  }

  return (
    <>
      <DataGrid
        columns={candidateColumns}
        data={candidates}
        searchPlaceholder="Search candidates…"
        filters={candidateFilters}
        onRowClick={setEditing}
        emptyState="No candidates yet. Add one to start building your pipeline."
        toolbar={
          <Button size="lg">
            <Plus />
            Add candidate
          </Button>
        }
      />

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <SheetContent className="w-full sm:max-w-md">
          {editing ? (
            <EditCandidateForm
              key={editing.id}
              candidate={editing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function EditCandidateForm({
  candidate,
  onSave,
  onCancel,
}: {
  candidate: Candidate;
  onSave: (candidate: Candidate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(candidate.name);
  const [email, setEmail] = React.useState(candidate.email);
  const [role, setRole] = React.useState(candidate.role);
  const [currentCompany, setCurrentCompany] = React.useState(
    candidate.currentCompany,
  );
  const [location, setLocation] = React.useState(candidate.location);
  const [status, setStatus] = React.useState(candidate.status);
  const [expectedSalary, setExpectedSalary] = React.useState(
    String(candidate.expectedSalary),
  );
  const [noticePeriodDays, setNoticePeriodDays] = React.useState(
    String(candidate.noticePeriodDays),
  );
  const [owner, setOwner] = React.useState(candidate.owner);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...candidate,
      name,
      email,
      role,
      currentCompany,
      location,
      status,
      expectedSalary: Number(expectedSalary) || 0,
      noticePeriodDays: Number(noticePeriodDays) || 0,
      owner,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit candidate</SheetTitle>
        <SheetDescription>Update {candidate.name}’s profile.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Name" htmlFor="candidate-name">
          <Input
            id="candidate-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Email" htmlFor="candidate-email">
          <Input
            id="candidate-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Current title" htmlFor="candidate-role">
          <Input
            id="candidate-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </FormField>
        <FormField label="Current company" htmlFor="candidate-company">
          <Input
            id="candidate-company"
            value={currentCompany}
            onChange={(e) => setCurrentCompany(e.target.value)}
          />
        </FormField>
        <FormField label="Location" htmlFor="candidate-location">
          <Input
            id="candidate-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </FormField>
        <FormField label="Status" htmlFor="candidate-status">
          <EnumSelect
            id="candidate-status"
            value={status}
            onValueChange={(v) => setStatus(v as Candidate['status'])}
            options={statusOptions}
          />
        </FormField>
        <FormField label="Expected salary" htmlFor="candidate-salary">
          <Input
            id="candidate-salary"
            type="number"
            value={expectedSalary}
            onChange={(e) => setExpectedSalary(e.target.value)}
          />
        </FormField>
        <FormField label="Notice period (days)" htmlFor="candidate-notice">
          <Input
            id="candidate-notice"
            type="number"
            value={noticePeriodDays}
            onChange={(e) => setNoticePeriodDays(e.target.value)}
          />
        </FormField>
        <FormField label="Owner" htmlFor="candidate-owner">
          <Input
            id="candidate-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
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
