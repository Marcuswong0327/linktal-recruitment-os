'use client';

import * as React from 'react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import {
  deleteCandidate as deleteCandidateRequest,
  getGetCandidatesQueryKey,
  updateCandidate as updateCandidateRequest,
  useGetCandidates,
  useUpdateCandidate,
} from '@/lib/api/generated/candidates/candidates';
import type {
  GetCandidatesParams,
  GetCandidatesSortBy,
  GetCandidatesStatus,
  UpdateCandidateDto,
} from '@/lib/api/generated/types';
import type { ColumnDef } from '@tanstack/react-table';
import {
  type Candidate,
  type CandidateStatus,
  candidateStatuses,
  candidateStatusLabels,
  candidateStatusVariants,
  candidateStatusTriggerClassName,
} from './schema';
import { candidateColumns } from './columns';
import { CandidateRowActions } from './CandidateRowActions';

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
  variant: candidateStatusVariants[value],
  triggerClassName: candidateStatusTriggerClassName[value],
}));

const candidateFilters: DataGridFilter[] = [
  // single: the API takes one status value (or ALL).
  { columnId: 'status', title: 'Status', options: statusOptions, single: true },
];

const PAGE_SIZE = 20;

/** Editable fields for the row edit drawer — a quick-edit subset mirroring the table's columns. */
interface CandidateFormValues {
  fullName: string;
  currentPosition: string | null;
  currentCompany: string | null;
  city: string | null;
  country: string | null;
  status: CandidateStatus;
  yearsExperience: number | null;
  salaryExpectation: string | null;
}

export function CandidatesTable({ canCreate = true, canDelete = true }: { canCreate?: boolean; canDelete?: boolean }) {
  const queryClient = useQueryClient();

  // Append a per-row delete action only when the user may delete.
  const columns = React.useMemo<ColumnDef<Candidate>[]>(() => {
    if (!canDelete) return candidateColumns;
    return [
      ...candidateColumns,
      {
        id: 'actions',
        header: '',
        size: 56,
        enableSorting: false,
        meta: { align: 'center' },
        cell: ({ row }) => <CandidateRowActions candidate={row.original} />,
      },
    ];
  }, [canDelete]);
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState<Pick<GetCandidatesParams, 'q' | 'status' | 'sortBy' | 'sortOrder'>>({});
  const [editing, setEditing] = React.useState<Candidate | null>(null);
  const [selectedCandidates, setSelectedCandidates] = React.useState<Candidate[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);

  const { data, isLoading, isError, error } = useGetCandidates(
    { page, pageSize: PAGE_SIZE, ...query },
    // Keep the previous page's rows while the next one loads (no flash).
    { query: { placeholderData: keepPreviousData } },
  );

  const updateCandidate = useUpdateCandidate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        toast.success('Saved changes');
        setEditing(null);
      },
      onError: (err) => toast.error(err.message || 'Failed to update candidate'),
    },
  });

  // customFetch throws on non-2xx, so a resolved query is always the 200
  // envelope; the guard is for TypeScript's discriminated union.
  const result = data?.status === 200 ? data.data : undefined;
  const candidates = result?.data ?? [];

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const statusFilter = (columnFilters.find((f) => f.id === 'status')?.value as string[] | undefined) ?? [];
    const sort = sorting[0];
    setQuery({
      q: search.trim() || undefined,
      status: statusFilter.length === 1 ? (statusFilter[0] as GetCandidatesStatus) : undefined,
      sortBy: sort ? (sort.id as GetCandidatesSortBy) : undefined,
      sortOrder: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    });
    setPage(1);
  }

  function handleSave(values: CandidateFormValues) {
    if (!editing) return;
    updateCandidate.mutate({ id: editing.id, data: values as unknown as UpdateCandidateDto });
  }

  // Bypasses the useUpdateCandidate hook (which only tracks one in-flight call
  // at a time) — bulk fires several concurrent requests, and we want a single
  // summary toast, not one per row.
  async function handleBulkUpdate(data: UpdateCandidateDto, actionLabel: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selectedCandidates.map((c) => updateCandidateRequest(c.id, data)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
    if (succeeded > 0) toast.success(`${actionLabel} for ${succeeded} candidate${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed for ${failed} candidate${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelectedCandidates([]);
  }

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    const results = await Promise.allSettled(selectedCandidates.map((c) => deleteCandidateRequest(c.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
    if (succeeded > 0) toast.success(`Deleted ${succeeded} candidate${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed to delete ${failed} candidate${failed === 1 ? '' : 's'}`);
    setIsBulkDeleting(false);
    setSelectedCandidates([]);
  }

  if (isError) {
    return <p className="text-sm text-destructive">Failed to load candidates: {error?.message ?? 'Unknown error'}</p>;
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={candidates}
        isLoading={isLoading}
        searchPlaceholder="Search candidates…"
        filters={candidateFilters}
        onRowClick={setEditing}
        getRowId={(c) => c.id}
        onSelectionChange={setSelectedCandidates}
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
        }}
        emptyState="No candidates yet. Add one to start building your pipeline."
        toolbar={
          selectedCandidates.length > 0 ? (
            <div className="flex animate-in items-center gap-2 fade-in-0 duration-200">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="destructive"
                      size="lg"
                      disabled={!canDelete || isBulkDeleting}
                      title={canDelete ? undefined : "You don't have permission to delete candidates"}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selectedCandidates.length} candidate{selectedCandidates.length === 1 ? '' : 's'}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the selected candidates and can't be undone.
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
                    <Button size="lg" disabled={isBulkUpdating}>
                      {isBulkUpdating ? 'Updating…' : `Bulk actions (${selectedCandidates.length})`}
                      <ChevronDown />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {candidateStatuses.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleBulkUpdate({ status: s }, `Marked ${candidateStatusLabels[s]}`)}
                    >
                      <Badge variant={candidateStatusVariants[s]}>{candidateStatusLabels[s]}</Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button
              size="lg"
              // disabled={!canCreate}
              disabled={true}
              title={canCreate ? undefined : "You don't have permission to add candidates"}
              className="animate-in fade-in-0 duration-200"
            >
              <Plus />
              Add Candidate
            </Button>
          )
        }
      />

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {editing ? (
            <CandidateForm
              key={editing.id}
              candidate={editing}
              isSaving={updateCandidate.isPending}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Row edit drawer — a quick-edit subset of the candidate's fields; the full profile lives on the detail page. */
function CandidateForm({
  candidate,
  isSaving,
  onSave,
  onCancel,
}: {
  candidate: Candidate;
  isSaving: boolean;
  onSave: (values: CandidateFormValues) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = React.useState(candidate.fullName);
  const [currentPosition, setCurrentPosition] = React.useState(candidate.currentPosition ?? '');
  const [currentCompany, setCurrentCompany] = React.useState(candidate.currentCompany ?? '');
  const [city, setCity] = React.useState(candidate.city ?? '');
  const [country, setCountry] = React.useState(candidate.country ?? '');
  const [status, setStatus] = React.useState<CandidateStatus>(candidate.status);
  const [yearsExperience, setYearsExperience] = React.useState(
    candidate.yearsExperience != null ? String(candidate.yearsExperience) : '',
  );
  const [salaryExpectation, setSalaryExpectation] = React.useState(candidate.salaryExpectation ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      fullName,
      currentPosition: currentPosition || null,
      currentCompany: currentCompany || null,
      city: city || null,
      country: country || null,
      status,
      yearsExperience: yearsExperience === '' ? null : Number(yearsExperience),
      salaryExpectation: salaryExpectation || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit candidate</SheetTitle>
        <SheetDescription>Update {candidate.fullName}’s profile.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Full name" htmlFor="candidate-name">
          <Input id="candidate-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </FormField>
        <FormField label="Current title" htmlFor="candidate-position">
          <Input id="candidate-position" value={currentPosition} onChange={(e) => setCurrentPosition(e.target.value)} />
        </FormField>
        <FormField label="Current company" htmlFor="candidate-company">
          <Input id="candidate-company" value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)} />
        </FormField>
        <FormField label="City" htmlFor="candidate-city">
          <Input id="candidate-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label="Country" htmlFor="candidate-country">
          <Input id="candidate-country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </FormField>
        <FormField label="Status" htmlFor="candidate-status">
          <EnumSelect
            id="candidate-status"
            value={status}
            onValueChange={(v) => setStatus(v as CandidateStatus)}
            options={statusOptions}
          />
        </FormField>
        <FormField label="Years of experience" htmlFor="candidate-experience">
          <Input
            id="candidate-experience"
            type="number"
            min={0}
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
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
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving || !fullName.trim()}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </SheetFooter>
    </form>
  );
}
