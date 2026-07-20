'use client';

import * as React from 'react';
import { ChevronDown, Download, Plus, Trash2 } from 'lucide-react';
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
import { DataGrid, type DataGridQuery } from '@/components/DataGrid';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { TagListFilter } from '@/components/TagListFilter';
import { TextFilter } from '@/components/TextFilter';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { useConsultantLookup } from '@/components/ConsultantCombobox';
import { LogContactSheet, type LogContactValues } from '@/components/LogContactSheet';
import {
  deleteCandidate as deleteCandidateRequest,
  getGetCandidatesQueryKey,
  updateCandidate as updateCandidateRequest,
  useAddCandidateContactHistory,
  useGetCandidates,
  useUpdateCandidate,
} from '@/lib/api/generated/candidates/candidates';
import type {
  ConsultantEntity,
  CreateCandidateContactHistoryDto,
  GetCandidatesSortBy,
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
import { exportCandidatesToExcel } from './exportToExcel';
import { placementStatusLabels, submissionStatusLabels, type useCandidateSearch } from './useCandidateSearch';

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
  variant: candidateStatusVariants[value],
  triggerClassName: candidateStatusTriggerClassName[value],
}));

const submissionStatusOptions = Object.entries(submissionStatusLabels).map(([value, label]) => ({ value, label }));
const placementStatusOptions = Object.entries(placementStatusLabels).map(([value, label]) => ({ value, label }));

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

export function CandidatesTable({
  canCreate = true,
  canDelete = true,
  search,
  consultants,
}: {
  canCreate?: boolean;
  canDelete?: boolean;
  /** Filter/search state lifted into the search-gate parent — shared with its top dropdowns and Active Filters chips. */
  search: ReturnType<typeof useCandidateSearch>;
  /** Fetched once by the parent (also needed there for the query-language and chip labels) — avoids fetching it twice. */
  consultants: ConsultantEntity[];
}) {
  const queryClient = useQueryClient();
  const [loggingContactFor, setLoggingContactFor] = React.useState<Candidate | null>(null);

  // Log-a-contact is always available (backend enforces candidate:update);
  // delete inside the row is gated by canDelete.
  const columns = React.useMemo<ColumnDef<Candidate>[]>(
    () => [
      ...candidateColumns,
      {
        id: 'actions',
        header: '',
        size: canDelete ? 88 : 56,
        enableSorting: false,
        meta: { align: 'center' },
        cell: ({ row }) => (
          <CandidateRowActions
            candidate={row.original}
            canDelete={canDelete}
            onLogContact={setLoggingContactFor}
          />
        ),
      },
    ],
    [canDelete],
  );
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<Candidate | null>(null);
  const [selectedCandidates, setSelectedCandidates] = React.useState<Candidate[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);

  // The search-gate's filter state is the single source of truth for query
  // params; reset to page 1 whenever it actually changes (queryParams is
  // memoized on `filters`, so this only fires on a real change, not every
  // render).
  React.useEffect(() => setPage(1), [search.queryParams]);

  const { data, isLoading, isFetching, isError, error } = useGetCandidates(
    { page, pageSize: PAGE_SIZE, ...search.queryParams },
    // Keep the previous page's rows while the next one loads (no flash).
    { query: { placeholderData: keepPreviousData } },
  );

  // Candidate.consultantId is a raw ID (not server-resolved, same convention
  // as Client.consultantId) — resolved client-side for the export column.
  const { labelFor: consultantLabelFor } = useConsultantLookup(consultants);

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

  // Search/status/etc. are driven by the lifted `search` state (and its own
  // toolbar filters below), not by DataGrid's built-in search box or column
  // filters — this only ever sees column-header sort clicks.
  function handleQueryChange({ sorting }: DataGridQuery) {
    const sort = sorting[0];
    search.set('sortBy', sort ? (sort.id as GetCandidatesSortBy) : undefined);
    search.set('sortOrder', sort ? (sort.desc ? 'desc' : 'asc') : undefined);
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

  function handleExport() {
    exportCandidatesToExcel(selectedCandidates, consultantLabelFor);
  }

  const addContactHistory = useAddCandidateContactHistory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        toast.success('Contact logged');
        setLoggingContactFor(null);
      },
      onError: (err) => toast.error(err.message || 'Failed to log contact'),
    },
  });

  function handleLogContact(values: LogContactValues) {
    if (!loggingContactFor) return;
    // Generated DTO has `notes` as optional (undefined), not nullable — the
    // sheet emits `null` for "cleared", so build the payload without the key
    // entirely rather than sending an invalid `null`.
    addContactHistory.mutate({
      id: loggingContactFor.id,
      data: {
        contactType: values.contactType,
        contactedAt: values.contactedAt,
        ...(values.notes ? { notes: values.notes } : {}),
      } as unknown as CreateCandidateContactHistoryDto,
    });
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
      <div className="flex flex-wrap items-center gap-2">
        <DataGridFacetedFilter
          title="Status"
          options={statusOptions}
          selected={search.filters.statuses}
          onChange={(values) => search.set('statuses', values as CandidateStatus[])}
        />
        <TextFilter
          title="Location"
          value={search.filters.location}
          onChange={(value) => search.set('location', value)}
          placeholder="City or country…"
        />
        <TagListFilter
          title="Skills"
          values={search.filters.skills}
          onChange={(values) => search.set('skills', values)}
          placeholder="Type a skill, Enter to add…"
        />
        <DataGridFacetedFilter
          title="Consultant"
          options={consultants.map((c) => ({ value: c.id, label: c.fullName }))}
          selected={search.filters.consultantIds}
          onChange={(values) => search.set('consultantIds', values)}
        />
        <DataGridFacetedFilter
          title="Submission status"
          options={submissionStatusOptions}
          selected={search.filters.submissionStatuses}
          onChange={(values) => search.set('submissionStatuses', values as typeof search.filters.submissionStatuses)}
        />
        <DataGridFacetedFilter
          title="Placement status"
          options={placementStatusOptions}
          selected={search.filters.placementStatuses}
          onChange={(values) => search.set('placementStatuses', values as typeof search.filters.placementStatuses)}
        />
        <DateRangeFilter
          title="Last contacted"
          from={search.filters.lastContactedFrom}
          to={search.filters.lastContactedTo}
          onChange={({ from, to }) => {
            search.set('lastContactedFrom', from);
            search.set('lastContactedTo', to);
          }}
        />
      </div>

      <DataGrid
        columns={columns}
        data={candidates}
        isLoading={isLoading}
        isFetching={isFetching}
        hideSearch
        onRowClick={setEditing}
        enableRowRangeSelect
        hideSelectColumn
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
              <Button size="lg" variant="outline" onClick={handleExport}>
                <Download />
                Export to Excel
              </Button>

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

      <LogContactSheet
        open={loggingContactFor !== null}
        onOpenChange={(open) => !open && setLoggingContactFor(null)}
        subjectLabel={loggingContactFor?.fullName ?? ''}
        isSaving={addContactHistory.isPending}
        onSave={handleLogContact}
      />
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
