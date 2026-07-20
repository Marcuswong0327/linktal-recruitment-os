'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Combobox } from '@base-ui/react/combobox';
import { ChevronDown, Download, Plus, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ConsultantCombobox,
  ConsultantComboboxPopup,
  useConsultantLookup,
} from '@/components/ConsultantCombobox';
import { ConsultantFilter } from '@/components/ConsultantFilter';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { NameComboboxFilter } from '@/components/NameComboboxFilter';
import {
  deleteClient as deleteClientRequest,
  getGetClientsQueryKey,
  updateClient as updateClientRequest,
  useCreateClient,
  useGetClients,
} from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import {
  getGetIndustriesQueryKey,
  useCreateIndustry,
  useGetIndustries,
} from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
  useGetSpecializations,
} from '@/lib/api/generated/specializations/specializations';
import {
  GetClientsSortBy,
  GetClientsSortOrder,
  type ConsultantEntity,
  type GetClientsQuality,
  type GetClientsStatus,
  type IndustryEntity,
  type SpecializationEntity,
  type UpdateClientDto,
} from '@/lib/api/generated/types';
import { getCompanyColumns, qualityOptions, statusOptions, statusVariant, tobOptions } from './columns';
import { exportCompaniesToExcel } from './exportToExcel';
import {
  type ClientQuality,
  type ClientStatus,
  type Company,
  clientQualityLabels,
  clientStatusLabels,
  clientStatuses,
} from './schema';

const PAGE_SIZE = 20;

/** Editable fields shared by the create and edit forms — no `id`, since create doesn't have one yet. */
interface CompanyFormValues {
  companyName: string;
  industryId: string | null;
  specializationId: string | null;
  city: string | null;
  country: string | null;
  status: ClientStatus;
  quality: ClientQuality;
  tobSigned: boolean;
  feePercentage: number | null;
  consultantId: string | null;
}

export function CompaniesTable({
  canCreate = true,
  canDelete = true,
}: {
  canCreate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Consultants only ever see their own book of companies (enforced
  // server-side in ClientsService.findAll) — the "filter by consultant"
  // control would be a no-op for them, so it's hidden rather than shown
  // disabled.
  const { data: session } = useSession();
  const isConsultant = session?.user?.roleName === 'consultant';
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState<GetClientsStatus | undefined>();
  const [quality, setQuality] = React.useState<GetClientsQuality | undefined>();
  const [industry, setIndustry] = React.useState<string | undefined>();
  const [specialization, setSpecialization] = React.useState<string | undefined>();
  const [tobSigned, setTobSigned] = React.useState<boolean | undefined>();
  const [consultantId, setConsultantId] = React.useState<string | undefined>();
  const [sortBy, setSortBy] = React.useState<GetClientsSortBy | undefined>();
  const [sortOrder, setSortOrder] = React.useState<GetClientsSortOrder>(GetClientsSortOrder.desc);
  const [creating, setCreating] = React.useState(false);
  const [selectedCompanies, setSelectedCompanies] = React.useState<Company[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [consultantPickerOpen, setConsultantPickerOpen] = React.useState(false);
  const bulkActionsTriggerRef = React.useRef<HTMLButtonElement>(null);

  const { data, isLoading, isFetching, isError, error } = useGetClients(
    {
      page,
      pageSize: PAGE_SIZE,
      q: search,
      status,
      quality,
      industry,
      specialization,
      tobSigned,
      consultantId,
      sortBy,
      sortOrder,
    },
    { query: { placeholderData: keepPreviousData } },
  );

  // Client-side join: the API returns consultantId only, so pull the full
  // consultant list once to resolve names for the table and edit form.
  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  const { labelFor: consultantLabelFor } = useConsultantLookup(consultants);
  // Also drives the Industry/Specialization filter pickers below.
  const { data: industryData } = useGetIndustries();
  const industries: IndustryEntity[] = industryData?.status === 200 ? industryData.data : [];
  const { data: specializationData } = useGetSpecializations();
  const specializations: SpecializationEntity[] =
    specializationData?.status === 200 ? specializationData.data : [];
  // Disables a row's inline pills (relationship/TOB/consultant) while any one of them is saving.
  const [pendingRowId, setPendingRowId] = React.useState<string | null>(null);

  const companyFilters: DataGridFilter[] = React.useMemo(
    () => [
      { columnId: 'status', title: 'Relationship', single: true, options: statusOptions },
      { columnId: 'quality', title: 'Quality', single: true, options: qualityOptions },
      {
        columnId: 'industry',
        title: 'Industry',
        single: true,
        render: ({ selected, onChange }: { selected: string[]; onChange: (value: string[]) => void }) => (
          <NameComboboxFilter
            title="Industry"
            value={selected[0]}
            onValueChange={(v) => onChange(v !== undefined ? [v] : [])}
            options={industries}
          />
        ),
      },
      {
        columnId: 'specialization',
        title: 'Specialization',
        single: true,
        render: ({ selected, onChange }: { selected: string[]; onChange: (value: string[]) => void }) => (
          <NameComboboxFilter
            title="Specialization"
            value={selected[0]}
            onValueChange={(v) => onChange(v !== undefined ? [v] : [])}
            options={specializations}
          />
        ),
      },
      { columnId: 'tobSigned', title: 'TOB', single: true, options: tobOptions },
      ...(isConsultant
        ? []
        : [
            {
              columnId: 'consultantId',
              title: 'Consultant',
              single: true,
              render: ({ selected, onChange }: {
                selected: string[];
                onChange: (value: string[]) => void;
              }) => (
                <ConsultantFilter
                  value={selected[0]}
                  onValueChange={(v) => onChange(v !== undefined ? [v] : [])}
                  consultants={consultants}
                />
              ),
            },
          ]),
    ],
    [consultants, industries, specializations, isConsultant],
  );

  const createClient = useCreateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        toast.success('Company added');
        setCreating(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to add company'),
    },
  });

  const result = data?.status === 200 ? data.data : undefined;
  const companies = result?.data ?? [];

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as
      string[] | undefined;
    const qualityFilter = columnFilters.find((f) => f.id === 'quality')?.value as
      string[] | undefined;
    const industryFilter = columnFilters.find((f) => f.id === 'industry')?.value as
      string[] | undefined;
    const specializationFilter = columnFilters.find((f) => f.id === 'specialization')?.value as
      string[] | undefined;
    const tobFilter = columnFilters.find((f) => f.id === 'tobSigned')?.value as
      string[] | undefined;
    const consultantFilter = columnFilters.find((f) => f.id === 'consultantId')?.value as
      string[] | undefined;
    const sort = sorting[0];
    // Only forward column ids the backend actually knows how to sort by
    // (see ClientSortField) — every sortable column here is named after its
    // ClientSortField counterpart, so this is a plain membership check.
    const sortField = sort && sort.id in GetClientsSortBy ? (sort.id as GetClientsSortBy) : undefined;
    setSearch(search.trim() || undefined);
    setStatus(statusFilter?.[0] as GetClientsStatus | undefined);
    setQuality(qualityFilter?.[0] as GetClientsQuality | undefined);
    setIndustry(industryFilter?.[0]);
    setSpecialization(specializationFilter?.[0]);
    setTobSigned(tobFilter?.[0] === undefined ? undefined : tobFilter[0] === 'true');
    setConsultantId(consultantFilter?.[0]);
    setSortBy(sortField);
    setSortOrder(sort?.desc ? GetClientsSortOrder.desc : GetClientsSortOrder.asc);
    setPage(1);
  }

  function handleCreate(values: CompanyFormValues) {
    createClient.mutate({
      data: {
        companyName: values.companyName,
        industryId: values.industryId ?? undefined,
        specializationId: values.specializationId ?? undefined,
        city: values.city ?? undefined,
        country: values.country ?? undefined,
        status: values.status,
        quality: values.quality,
        tobSigned: values.tobSigned,
        feePercentage: values.feePercentage ?? undefined,
        consultantId: values.consultantId ?? undefined,
      },
    });
  }

  // Fires several concurrent requests directly (not via a mutation hook, which
  // only tracks one in-flight call at a time) so bulk gets a single summary
  // toast instead of one per row.
  async function handleBulkUpdate(data: UpdateClientDto, actionLabel: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(
      selectedCompanies.map((c) => updateClientRequest(c.id, data)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    if (succeeded > 0)
      toast.success(`${actionLabel} for ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'}`);
    if (failed > 0) toast.error(`Failed for ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkUpdating(false);
    setSelectedCompanies([]);
  }

  function handleExport() {
    exportCompaniesToExcel(selectedCompanies, consultantLabelFor);
  }

  function handleEnrichStakeholders() {
    const clientIds = selectedCompanies.map((c) => c.id).join(',');
    router.push(`/companies/stakeholder-workspace?clientIds=${encodeURIComponent(clientIds)}`);
  }

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    const results = await Promise.allSettled(
      selectedCompanies.map((c) => deleteClientRequest(c.id)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    if (succeeded > 0) toast.success(`Deleted ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'}`);
    if (failed > 0) toast.error(`Failed to delete ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkDeleting(false);
    setSelectedCompanies([]);
  }

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
      handleInlineUpdate(
        company,
        { status: newStatus },
        `Relationship set to ${clientStatusLabels[newStatus]}`,
      ),
    [handleInlineUpdate],
  );

  const handleQualityChange = React.useCallback(
    (company: Company, newQuality: ClientQuality) =>
      handleInlineUpdate(
        company,
        { quality: newQuality },
        `Quality set to ${clientQualityLabels[newQuality]}`,
      ),
    [handleInlineUpdate],
  );

  const handleTobSignedChange = React.useCallback(
    (company: Company, newTobSigned: boolean) =>
      handleInlineUpdate(
        company,
        { tobSigned: newTobSigned },
        newTobSigned ? 'TOB signed' : 'TOB marked not signed',
      ),
    [handleInlineUpdate],
  );

  const columns = React.useMemo(
    () =>
      getCompanyColumns({
        consultants,
        onConsultantChange: handleConsultantChange,
        onStatusChange: handleStatusChange,
        onQualityChange: handleQualityChange,
        onTobSignedChange: handleTobSignedChange,
        pendingRowId,
        hideConsultantColumn: isConsultant,
      }),
    [
      consultants,
      handleConsultantChange,
      handleStatusChange,
      handleQualityChange,
      handleTobSignedChange,
      pendingRowId,
      isConsultant,
    ],
  );

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load companies: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={companies}
        isLoading={isLoading}
        isFetching={isFetching}
        searchPlaceholder="Search Companies"
        filters={companyFilters}
        onRowClick={(company) => router.push(`/companies/${company.id}`)}
        enableRowRangeSelect
        hideSelectColumn
        emptyState="No companies yet. Add your first client to get started."
        getRowId={(c) => c.id}
        onSelectionChange={setSelectedCompanies}
        footerActions={
          <Button
            size="sm"
            disabled={!canCreate}
            title={canCreate ? undefined : "You don't have permission to add companies"}
            onClick={() => setCreating(true)}
          >
            <Plus />
            Add Company
          </Button>
        }
        toolbar={
          selectedCompanies.length > 0 ? (
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
                      title={
                        canDelete ? undefined : "You don't have permission to delete companies"
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
                      Delete {selectedCompanies.length} compan
                      {selectedCompanies.length === 1 ? 'y' : 'ies'}?
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
                            handleBulkUpdate(
                              { status: s },
                              `Relationship set to ${clientStatusLabels[s]}`,
                            )
                          }
                        >
                          <Badge variant={statusVariant[s]}>{clientStatusLabels[s]}</Badge>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onClick={() => setConsultantPickerOpen(true)}>
                    Set consultant
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleEnrichStakeholders}>
                    Enrich Data with Stakeholders
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

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full sm:max-w-md">
          {creating ? (
            <CompanyForm
              consultants={consultants}
              isSaving={createClient.isPending}
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
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

/** The "Add company" drawer form — every field but the name is optional. */
function CompanyForm({
  consultants,
  isSaving,
  onSave,
  onCancel,
}: {
  consultants: ConsultantEntity[];
  isSaving: boolean;
  onSave: (values: CompanyFormValues) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const { data: specializationData } = useGetSpecializations();
  const specializations = specializationData?.status === 200 ? specializationData.data : [];

  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add industry'),
    },
  });
  const createSpecialization = useCreateSpecialization({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add specialization'),
    },
  });
  async function handleCreateIndustry(name: string) {
    const res = await createIndustry.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add industry');
    return res.data;
  }
  async function handleCreateSpecialization(name: string) {
    const res = await createSpecialization.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    return res.data;
  }

  const [companyName, setCompanyName] = React.useState('');
  const [industryId, setIndustryId] = React.useState('');
  const [specializationId, setSpecializationId] = React.useState('');
  const [city, setCity] = React.useState('');
  const [country, setCountry] = React.useState('');
  const [status, setStatus] = React.useState<ClientStatus>('COLD');
  const [quality, setQuality] = React.useState<ClientQuality>('MEDIUM');
  const [tobSigned, setTobSigned] = React.useState(false);
  const [feePercentage, setFeePercentage] = React.useState('');
  const [consultantId, setConsultantId] = React.useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      companyName,
      industryId: industryId || null,
      specializationId: specializationId || null,
      city: city || null,
      country: country || null,
      status,
      quality,
      tobSigned,
      feePercentage: feePercentage === '' ? null : Number(feePercentage),
      consultantId: consultantId || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Add company</SheetTitle>
        <SheetDescription>Add a new client company.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company name" htmlFor="company-name">
          <Input
            id="company-name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </FormField>
        <FormField label="Industry" htmlFor="company-industry">
          <CreatableCombobox
            id="company-industry"
            value={industryId}
            onValueChange={setIndustryId}
            options={industries}
            onCreate={handleCreateIndustry}
          />
        </FormField>
        <FormField label="Specialization" htmlFor="company-specialization">
          <CreatableCombobox
            id="company-specialization"
            value={specializationId}
            onValueChange={setSpecializationId}
            options={specializations}
            onCreate={handleCreateSpecialization}
          />
        </FormField>
        <FormField label="City" htmlFor="company-city">
          <Input id="company-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label="Country" htmlFor="company-country">
          <Input
            id="company-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </FormField>
        <FormField label="Relationship" htmlFor="company-status">
          <EnumSelect
            id="company-status"
            value={status}
            onValueChange={(v) => setStatus(v as ClientStatus)}
            options={statusOptions}
          />
        </FormField>
        <FormField label="Quality" htmlFor="company-quality">
          <EnumSelect
            id="company-quality"
            value={quality}
            onValueChange={(v) => setQuality(v as ClientQuality)}
            options={qualityOptions}
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
        <Button type="submit" size="lg" disabled={isSaving || !companyName.trim()}>
          {isSaving ? 'Saving…' : 'Add company'}
        </Button>
      </SheetFooter>
    </form>
  );
}
