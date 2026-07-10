'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

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
import {
  useGetCandidates,
  useUpdateCandidate,
  getGetCandidatesQueryKey,
} from '@/lib/api/generated/candidates/candidates';
import type { UpdateCandidateDto } from '@/lib/api/generated/types';
import {
  type Candidate,
  candidateStatuses,
  candidateStatusLabels,
} from './schema';
import { candidateColumns } from './columns';

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
}));

const candidateFilters: DataGridFilter[] = [
  { columnId: 'status', title: 'Status', options: statusOptions },
];

export function CandidatesTable() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useGetCandidates();
  const [editing, setEditing] = React.useState<Candidate | null>(null);

  const updateCandidate = useUpdateCandidate({
    mutation: {
      onSuccess: (_result, { data: patch }) => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        setEditing(null);
        toast.success(`Saved changes to ${patch.fullName ?? 'candidate'}`);
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to save candidate');
      },
    },
  });

  // customFetch throws on non-2xx, so a resolved query is always the 200
  // envelope; the guard is for TypeScript's discriminated union.
  const candidates = data?.status === 200 ? data.data.data : [];

  function handleSave(patch: UpdateCandidateDto) {
    if (!editing) return;
    updateCandidate.mutate({ id: editing.id, data: patch });
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load candidates: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        columns={candidateColumns}
        data={candidates}
        isLoading={isLoading}
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
              saving={updateCandidate.isPending}
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
  saving,
  onSave,
  onCancel,
}: {
  candidate: Candidate;
  saving: boolean;
  onSave: (patch: UpdateCandidateDto) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = React.useState(candidate.fullName);
  const [email, setEmail] = React.useState(candidate.email ?? '');
  const [mobile, setMobile] = React.useState(candidate.mobile ?? '');
  const [currentPosition, setCurrentPosition] = React.useState(
    candidate.currentPosition ?? '',
  );
  const [currentCompany, setCurrentCompany] = React.useState(
    candidate.currentCompany ?? '',
  );
  const [city, setCity] = React.useState(candidate.city ?? '');
  const [status, setStatus] = React.useState<Candidate['status']>(
    candidate.status,
  );
  const [salaryExpectation, setSalaryExpectation] = React.useState(
    candidate.salaryExpectation ?? '',
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // PATCH semantics: drop empty strings instead of sending "" to nullable
    // API fields (the DTO has no way to express clearing a field).
    const patch = Object.fromEntries(
      Object.entries({
        fullName,
        email,
        mobile,
        currentPosition,
        currentCompany,
        city,
        status,
        salaryExpectation,
      }).filter(([, value]) => value !== ''),
    ) as UpdateCandidateDto;
    onSave(patch);
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit candidate</SheetTitle>
        <SheetDescription>
          Update {candidate.fullName}’s profile.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Name" htmlFor="candidate-name">
          <Input
            id="candidate-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
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
        <FormField label="Mobile" htmlFor="candidate-mobile">
          <Input
            id="candidate-mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </FormField>
        <FormField label="Current title" htmlFor="candidate-position">
          <Input
            id="candidate-position"
            value={currentPosition}
            onChange={(e) => setCurrentPosition(e.target.value)}
          />
        </FormField>
        <FormField label="Current company" htmlFor="candidate-company">
          <Input
            id="candidate-company"
            value={currentCompany}
            onChange={(e) => setCurrentCompany(e.target.value)}
          />
        </FormField>
        <FormField label="City" htmlFor="candidate-city">
          <Input
            id="candidate-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
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
            value={salaryExpectation}
            onChange={(e) => setSalaryExpectation(e.target.value)}
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </SheetFooter>
    </form>
  );
}
