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
import { ConsultantCombobox, ConsultantComboboxPopup, useConsultantLookup } from '@/components/ConsultantCombobox';
import { ConsultantFilter } from '@/components/ConsultantFilter';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import {
  deleteClient as deleteClientRequest,
  getGetClientsQueryKey,
  updateClient as updateClientRequest,
  useGetClients,
  useUpdateClient,
} from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import type { ConsultantEntity, GetClientsStatus, UpdateClientDto } from '@/lib/api/generated/types';
import { getCompanyColumns, statusVariant, tobVariant } from './columns';
import { type ClientStatus, type Company, clientStatusLabels, clientStatuses } from './schema';

const PAGE_SIZE = 20;

const statusOptions = clientStatuses.map((value) => ({
  value,
  label: clientStatusLabels[value],
  variant: statusVariant[value],
}));

const tobOptions = [
  { value: 'true', label: 'Signed', variant: tobVariant.true },
  { value: 'false', label: 'Not signed', variant: tobVariant.false },
];

export function CompaniesTable({
  canCreate = true,
  canDelete = true,
}: {
  canCreate?: boolean;
  canDelete?: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState<GetClientsStatus | undefined>();
  const [tobSigned, setTobSigned] = React.useState<boolean | undefined>();
  const [consultantId, setConsultantId] = React.useState<string | undefined>();
  const [editing, setEditing] = React.useState<Company | null>(null);
  const [selectedCompanies, setSelectedCompanies] = React.useState<Company[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [consultantPickerOpen, setConsultantPickerOpen] = React.useState(false);
  const bulkActionsTriggerRef = React.useRef<HTMLButtonElement>(null);

  const { data, isLoading, isError, error } = useGetClients(
    { page, pageSize: PAGE_SIZE, q: search, status, tobSigned, consultantId },
    { query: { placeholderData: keepPreviousData } },
  );

  // Client-side join: the API returns consultantId only, so pull the full
  // consultant list once to resolve names for the table and edit form.
  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  // Disables a row's inline pills (relationship/TOB/consultant) while any one of them is saving.
  const [pendingRowId, setPendingRowId] = React.useState<string | null>(null);

  const companyFilters: DataGridFilter[] = React.useMemo(
    () => [
      { columnId: 'status', title: 'Relationship', single: true, options: statusOptions },
      { columnId: 'tobSigned', title: 'TOB', single: true, options: tobOptions },
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

  const updateClient = useUpdateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        toast.success('Saved changes');
        setEditing(null);
      },
      onError: (err) => toast.error(err.message || 'Failed to update company'),
    },
  });

  const result = data?.status === 200 ? data.data : undefined;
  const companies = result?.data ?? [];

  function handleQueryChange({ search, columnFilters }: DataGridQuery) {
    const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as string[] | undefined;
    const tobFilter = columnFilters.find((f) => f.id === 'tobSigned')?.value as string[] | undefined;
    const consultantFilter = columnFilters.find((f) => f.id === 'consultantId')?.value as string[] | undefined;
    setSearch(search.trim() || undefined);
    setStatus(statusFilter?.[0] as GetClientsStatus | undefined);
    setTobSigned(tobFilter?.[0] === undefined ? undefined : tobFilter[0] === 'true');
    setConsultantId(consultantFilter?.[0]);
    setPage(1);
  }

  function handleSave(updated: Company) {
    updateClient.mutate({
      id: updated.id,
      data: {
        companyName: updated.companyName,
        // Generated type omits null (the API accepts it to clear these
        // fields) — `?? undefined` here would drop the key entirely from the
        // request body, silently no-op'ing an intended clear while still
        // reporting success.
        industry: updated.industry,
        city: updated.city,
        country: updated.country,
        status: updated.status,
        tobSigned: updated.tobSigned,
        feePercentage: updated.feePercentage,
        consultantId: updated.consultantId,
      } as unknown as UpdateClientDto,
    });
  }

  // Bypasses the useUpdateClient hook (which only tracks one in-flight call at
  // a time) — bulk fires several concurrent requests, and we want a single
  // summary toast, not one per row.
  async function handleBulkUpdate(data: UpdateClientDto, actionLabel: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selectedCompanies.map((c) => updateClientRequest(c.id, data)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    if (succeeded > 0) toast.success(`${actionLabel} for ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'}`);
    if (failed > 0) toast.error(`Failed for ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkUpdating(false);
    setSelectedCompanies([]);
  }

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    const results = await Promise.allSettled(selectedCompanies.map((c) => deleteClientRequest(c.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    if (succeeded > 0) toast.success(`Deleted ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'}`);
    if (failed > 0) toast.error(`Failed to delete ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkDeleting(false);
    setSelectedCompanies([]);
  }

  // Separate from useUpdateClient (used by the edit drawer) so an inline pill
  // change doesn't fight the drawer's isSaving/onSuccess (which closes it).
  const handleInlineUpdate = React.useCallback(
    async (company: Company, data: UpdateClientDto, successLabel: string) => {
      setPendingRowId(company.id);
      try {
        await updateClientRequest(company.id, data);
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        toast.success(successLabel);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update company');
      } finally {
        setPendingRowId(null);
      }
    },
    [queryClient],
  );

  const handleConsultantChange = React.useCallback(
    (company: Company, newConsultantId: string) =>
      handleInlineUpdate(
        company,
        // Generated type omits null (API accepts it to clear the FK) — cast
        // around the gap rather than sending '' which Prisma would reject as
        // an invalid foreign key.
        { consultantId: newConsultantId || null } as unknown as UpdateClientDto,
        newConsultantId ? 'Consultant assigned' : 'Consultant unassigned',
      ),
    [handleInlineUpdate],
  );

  const handleStatusChange = React.useCallback(
    (company: Company, newStatus: ClientStatus) =>
      handleInlineUpdate(company, { status: newStatus }, `Relationship set to ${clientStatusLabels[newStatus]}`),
    [handleInlineUpdate],
  );

  const handleTobSignedChange = React.useCallback(
    (company: Company, newTobSigned: boolean) =>
      handleInlineUpdate(company, { tobSigned: newTobSigned }, newTobSigned ? 'TOB signed' : 'TOB marked not signed'),
    [handleInlineUpdate],
  );

  const columns = React.useMemo(
    () =>
      getCompanyColumns({
        consultants,
        onConsultantChange: handleConsultantChange,
        onStatusChange: handleStatusChange,
        onTobSignedChange: handleTobSignedChange,
        pendingRowId,
      }),
    [consultants, handleConsultantChange, handleStatusChange, handleTobSignedChange, pendingRowId],
  );

  if (isError) {
    return <p className="text-sm text-destructive">Failed to load companies: {error?.message ?? 'Unknown error'}</p>;
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={companies}
        isLoading={isLoading}
        searchPlaceholder="Search Companies"
        filters={companyFilters}
        onRowClick={setEditing}
        emptyState="No companies yet. Add your first client to get started."
        getRowId={(c) => c.id}
        onSelectionChange={setSelectedCompanies}
        toolbar={
          selectedCompanies.length > 0 ? (
            <div className="flex animate-in items-center gap-2 fade-in-0 duration-200">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="destructive"
                      size="lg"
                      disabled={!canDelete || isBulkDeleting}
                      title={canDelete ? undefined : "You don't have permission to delete companies"}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selectedCompanies.length} compan{selectedCompanies.length === 1 ? 'y' : 'ies'}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the selected companies and can't be undone.
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
                      {isBulkUpdating ? 'Updating…' : `Bulk actions (${selectedCompanies.length})`}
                      <ChevronDown />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Set relationship</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {clientStatuses.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() =>
                            handleBulkUpdate({ status: s }, `Relationship set to ${clientStatusLabels[s]}`)
                          }
                        >
                          <Badge variant={statusVariant[s]}>{clientStatusLabels[s]}</Badge>
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
                    { consultantId: id || null } as unknown as UpdateClientDto,
                    id ? 'Consultant assigned' : 'Unassigned',
                  )
                }
              />
            </div>
          ) : (
            <Button
              size="lg"
              disabled={!canCreate}
              title={canCreate ? undefined : "You don't have permission to add companies"}
              className="animate-in fade-in-0 duration-200"
            >
              <Plus />
              Add company
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
            <EditCompanyForm
              key={editing.id}
              company={editing}
              consultants={consultants}
              isSaving={updateClient.isPending}
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

function EditCompanyForm({
  company,
  consultants,
  isSaving,
  onSave,
  onCancel,
}: {
  company: Company;
  consultants: ConsultantEntity[];
  isSaving: boolean;
  onSave: (company: Company) => void;
  onCancel: () => void;
}) {
  const [companyName, setCompanyName] = React.useState(company.companyName);
  const [industry, setIndustry] = React.useState(company.industry ?? '');
  const [city, setCity] = React.useState(company.city ?? '');
  const [country, setCountry] = React.useState(company.country ?? '');
  const [status, setStatus] = React.useState<ClientStatus>(company.status);
  const [tobSigned, setTobSigned] = React.useState(company.tobSigned);
  const [feePercentage, setFeePercentage] = React.useState(
    company.feePercentage != null ? String(company.feePercentage) : '',
  );
  const [consultantId, setConsultantId] = React.useState(company.consultantId ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...company,
      companyName,
      industry: industry || null,
      city: city || null,
      country: country || null,
      status,
      tobSigned,
      feePercentage: feePercentage === '' ? null : Number(feePercentage),
      consultantId: consultantId || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit company</SheetTitle>
        <SheetDescription>Update {company.companyName}’s account details.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company name" htmlFor="company-name">
          <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </FormField>
        <FormField label="Industry" htmlFor="company-industry">
          <Input id="company-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </FormField>
        <FormField label="City" htmlFor="company-city">
          <Input id="company-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label="Country" htmlFor="company-country">
          <Input id="company-country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </FormField>
        <FormField label="Relationship" htmlFor="company-status">
          <EnumSelect
            id="company-status"
            value={status}
            onValueChange={(v) => setStatus(v as ClientStatus)}
            options={statusOptions}
          />
        </FormField>
        <FormField label="Terms of Business" htmlFor="company-tob">
          <EnumSelect
            id="company-tob"
            value={String(tobSigned)}
            onValueChange={(v) => setTobSigned(v === 'true')}
            options={tobOptions}
          />
        </FormField>
        <FormField label="Fee %" htmlFor="company-fee">
          <Input
            id="company-fee"
            type="number"
            value={feePercentage}
            onChange={(e) => setFeePercentage(e.target.value)}
          />
        </FormField>
        <FormField label="Consultant" htmlFor="company-consultant">
          <ConsultantCombobox
            id="company-consultant"
            value={consultantId}
            onValueChange={setConsultantId}
            consultants={consultants}
          />
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
