'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { ChevronDown, Download, MapPin, Plus, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
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
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import {
  LEVEL_LABEL,
  LocationFilterButton,
  LocationMultiSelect,
  type LocationOption,
} from '@/components/LocationMultiSelect';
import {
  SpecializationCombobox,
  SpecializationFilterButton,
  type SpecializationOption,
} from '@/components/SpecializationPicker';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { downloadFile } from '@/lib/api/fetcher';
import {
  deleteClient,
  getExportClientsByIdsUrl,
  getExportClientsUrl,
  getGetClientsQueryKey,
  restoreClient,
  updateClient,
  useCreateClient,
  useGetClients,
  useUpdateClient,
} from '@/lib/api/generated/clients/clients';
import { getGetIndustriesQueryKey, useCreateIndustry, useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
} from '@/lib/api/generated/specializations/specializations';
import { GetClientsSortBy } from '@/lib/api/generated/types/getClientsSortBy';
import type {
  CreateClientDto,
  GetClientsQualitiesItem,
  GetClientsSortOrder,
  GetClientsStatusesItem,
  LocationEntity,
} from '@/lib/api/generated/types';
import { getCompanyColumns } from './columns';
import { qualityOptions, statusOptions, type ClientQuality, type ClientStatus, type Company } from './schema';

const PAGE_SIZE = 50;

/** Editable fields shared by the create sheet. Editing an existing company happens on its detail page. */
interface CompanyFormValues {
  companyName: string;
  industryId: string;
  specializationId: string;
  locations: LocationOption[];
  addresses: string;
  suburbsAndPostcodes: string;
  website: string;
  seekJobMarketUrl: string;
  linkedinJobMarketUrl: string;
  generalDescription: string;
  status: ClientStatus;
  quality: ClientQuality;
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCompanyPayload(values: CompanyFormValues): CreateClientDto {
  return {
    companyName: values.companyName,
    industryId: values.industryId,
    specializationId: values.specializationId || undefined,
    locationIds: values.locations.map((l) => l.id),
    addresses: values.addresses ? splitLines(values.addresses) : undefined,
    suburbsAndPostcodes: values.suburbsAndPostcodes ? splitLines(values.suburbsAndPostcodes) : undefined,
    website: values.website || undefined,
    seekJobMarketUrl: values.seekJobMarketUrl || undefined,
    linkedinJobMarketUrl: values.linkedinJobMarketUrl || undefined,
    generalDescription: values.generalDescription || undefined,
    status: values.status,
    quality: values.quality,
  };
}

export function CompaniesTable({
  canCreate = true,
  canUpdate = true,
  canDelete = true,
}: {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [statuses, setStatuses] = React.useState<GetClientsStatusesItem[] | undefined>();
  const [qualities, setQualities] = React.useState<GetClientsQualitiesItem[] | undefined>();
  const [industryIds, setIndustryIds] = React.useState<string[] | undefined>();
  const [specializationIds, setSpecializationIds] = React.useState<string[] | undefined>();
  const [locationIds, setLocationIds] = React.useState<string[] | undefined>();
  // Name for the Specialization filter's currently selected ids — same
  // reasoning/pattern as marketInfoById below (the search-driven
  // SpecializationFilterButton only resolves names for what it's fetched).
  const [specializationInfoById, setSpecializationInfoById] = React.useState<Map<string, string>>(
    new Map(),
  );
  const resolveSpecializationInfo = React.useCallback((id: string, name: string) => {
    setSpecializationInfoById((prev) => (prev.get(id) === name ? prev : new Map(prev).set(id, name)));
  }, []);
  // Name/level for the Market filter's currently selected location ids — the
  // API only returns these alongside a live search result, not by id, so
  // this is seeded as the user searches (see LocationFilterButton's
  // onResolve) and only needs to cover whatever's selected in this session.
  const [marketInfoById, setMarketInfoById] = React.useState<Map<string, { name: string; level: LocationEntity['level'] }>>(
    new Map(),
  );
  const resolveMarketInfo = React.useCallback((id: string, name: string, level: LocationEntity['level']) => {
    setMarketInfoById((prev) => (prev.get(id)?.name === name ? prev : new Map(prev).set(id, { name, level })));
  }, []);
  const [sortBy, setSortBy] = React.useState<GetClientsSortBy | undefined>();
  const [sortOrder, setSortOrder] = React.useState<GetClientsSortOrder>('desc');
  const [selected, setSelected] = React.useState<Company[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Opened via the global command palette's "Add a Company" action
  // (`/companies?new=1`) — strip the param immediately so refresh/back
  // doesn't reopen the sheet.
  React.useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true);
      router.replace('/companies');
    }
  }, [searchParams, router]);

  const { data, isLoading, isFetching, isError, error } = useGetClients(
    {
      page,
      pageSize: PAGE_SIZE,
      q: search,
      statuses,
      qualities,
      industryIds,
      specializationIds,
      locationIds,
      sortBy,
      sortOrder,
    },
    // Keep the previous page's rows while the next one loads — infinite
    // scroll otherwise flashes the whole list back to a loading skeleton
    // every time the sentinel row requests another batch.
    { query: { placeholderData: keepPreviousData } },
  );
  const result = data?.status === 200 ? data.data : undefined;
  const companies = useInfinitePages(result?.data, page, isFetching);

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  // Specialization (775+ rows) is deliberately NOT fetched eagerly here —
  // both the header filter and the create-form field are now
  // SpecializationPicker components that search `GET /specializations`
  // server-side instead.

  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add industry'),
    },
  });
  async function handleCreateIndustry(name: string) {
    const res = await createIndustry.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add industry');
    return res.data;
  }

  const createSpecialization = useCreateSpecialization({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add specialization'),
    },
  });

  const industryFilterOptions = React.useMemo(() => industries.map((i) => ({ value: i.id, label: i.name })), [industries]);

  const companyFilters: DataGridFilter[] = React.useMemo(
    () => [
      { columnId: 'status', title: 'Status', options: statusOptions, inHeader: true },
      { columnId: 'quality', title: 'Quality', options: qualityOptions, inHeader: true },
      { columnId: 'industry', title: 'Industry', options: industryFilterOptions, inHeader: true },
      {
        columnId: 'specialization',
        title: 'Specialization',
        inHeader: true,
        // Specialization is a ~775-row catalog — server-searched
        // (GET /specializations?q=&take=) rather than an eagerly-fetched
        // checkbox list, same as the Consultants page.
        render: ({ selected, onChange }: { selected: string[]; onChange: (values: string[]) => void }) => (
          <SpecializationFilterButton
            selected={selected}
            onChange={onChange}
            onResolve={resolveSpecializationInfo}
            title="Specialization"
          />
        ),
        labelFor: (id: string) => specializationInfoById.get(id) ?? id,
      },
      {
        columnId: 'locations',
        title: 'Market',
        inHeader: true,
        render: ({ selected, onChange }: { selected: string[]; onChange: (values: string[]) => void }) => (
          <LocationFilterButton selected={selected} onChange={onChange} onResolve={resolveMarketInfo} title="Market" />
        ),
        labelFor: (id: string) => marketInfoById.get(id)?.name ?? id,
        chipContent: (id: string) => {
          const info = marketInfoById.get(id);
          return (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {info?.name ?? id}
              {info ? (
                <span className="text-[10px] tracking-wide opacity-70 uppercase">{LEVEL_LABEL[info.level]}</span>
              ) : null}
            </span>
          );
        },
      },
    ],
    [marketInfoById, resolveMarketInfo, industryFilterOptions, specializationInfoById, resolveSpecializationInfo],
  );

  const createCompanyMutation = useCreateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        toast.success('Company added');
        setCreating(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to add company'),
    },
  });

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const valueOf = (columnId: string) => columnFilters.find((f) => f.id === columnId)?.value as string[] | undefined;
    const statusFilter = valueOf('status');
    const qualityFilter = valueOf('quality');
    const industryFilter = valueOf('industry');
    const specializationFilter = valueOf('specialization');
    const marketFilter = valueOf('locations');
    const sort = sorting[0];
    const sortField = sort && sort.id in GetClientsSortBy ? (sort.id as GetClientsSortBy) : undefined;
    setSearch(search.trim() || undefined);
    setStatuses(statusFilter?.length ? (statusFilter as GetClientsStatusesItem[]) : undefined);
    setQualities(qualityFilter?.length ? (qualityFilter as GetClientsQualitiesItem[]) : undefined);
    setIndustryIds(industryFilter?.length ? industryFilter : undefined);
    setSpecializationIds(specializationFilter?.length ? specializationFilter : undefined);
    setLocationIds(marketFilter?.length ? marketFilter : undefined);
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setPage(1);
  }

  function handleCreate(values: CompanyFormValues) {
    createCompanyMutation.mutate({ data: buildCompanyPayload(values) });
  }

  // Fires several concurrent requests directly (not via a mutation hook,
  // which only tracks one in-flight call at a time) so bulk gets a single
  // summary toast instead of one per row.
  async function handleBulkSetStatus(nextStatus: ClientStatus) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selected.map((c) => updateClient(c.id, { status: nextStatus })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    const label = statusOptions.find((o) => o.value === nextStatus)!.label;
    if (succeeded > 0) toast.success(`Marked ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'} as ${label}`);
    if (failed > 0) toast.error(`Failed for ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkUpdating(false);
    setSelected([]);
  }

  async function handleBulkSetQuality(nextQuality: ClientQuality) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(selected.map((c) => updateClient(c.id, { quality: nextQuality })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    const label = qualityOptions.find((o) => o.value === nextQuality)!.label;
    if (succeeded > 0) toast.success(`Marked ${succeeded} compan${succeeded === 1 ? 'y' : 'ies'} as ${label} quality`);
    if (failed > 0) toast.error(`Failed for ${failed} compan${failed === 1 ? 'y' : 'ies'}`);
    setIsBulkUpdating(false);
    setSelected([]);
  }

  const updateCompanyMutation = useUpdateClient({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to update company'),
    },
  });
  const pendingRowId = updateCompanyMutation.isPending ? (updateCompanyMutation.variables?.id ?? null) : null;

  const handleStatusChange = React.useCallback(
    (company: Company, statusValue: string) => {
      updateCompanyMutation.mutate(
        { id: company.id, data: { status: statusValue as ClientStatus } },
        { onSuccess: () => toast.success('Status updated') },
      );
    },
    [updateCompanyMutation],
  );

  const handleQualityChange = React.useCallback(
    (company: Company, qualityValue: string) => {
      updateCompanyMutation.mutate(
        { id: company.id, data: { quality: qualityValue as ClientQuality } },
        { onSuccess: () => toast.success('Quality updated') },
      );
    },
    [updateCompanyMutation],
  );

  function handleBulkDelete() {
    setDeleteConfirmOpen(false);
    const toDelete = selected;
    const label = `${toDelete.length} compan${toDelete.length === 1 ? 'y' : 'ies'}`;
    // Client has a real backend restore endpoint — restore mode: the delete
    // commits right away and Undo calls restoreClient, rather than deferring
    // the delete itself.
    deleteWithUndo({
      label,
      deleteFn: async () => {
        const results = await Promise.allSettled(toDelete.map((c) => deleteClient(c.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`Failed to delete ${failed} of ${toDelete.length} companies`);
      },
      restoreFn: async () => {
        await Promise.allSettled(toDelete.map((c) => restoreClient(c.id)));
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
    });
    setSelected([]);
  }

  // Routes through the server (not the old in-browser xlsx build) so
  // formatting stays in one place and scope is re-checked on every export —
  // a selection exports exactly those rows; no selection exports everything
  // matching the current filters, unbounded.
  async function handleExport() {
    setIsExporting(true);
    // The server has no ambient concept of "the viewer's timezone" — it only
    // ever sees UTC timestamps, so date/time export columns need this sent
    // along explicitly.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (selected.length > 0) {
        await downloadFile(getExportClientsByIdsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selected.map((c) => c.id), timezone }),
        });
      } else {
        await downloadFile(
          getExportClientsUrl({ q: search, statuses, qualities, industryIds, specializationIds, locationIds, sortBy, sortOrder, timezone }),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  const columns = React.useMemo(
    () =>
      getCompanyColumns({
        onStatusChange: handleStatusChange,
        onQualityChange: handleQualityChange,
        pendingRowId,
        canUpdate,
      }),
    [handleStatusChange, handleQualityChange, pendingRowId, canUpdate],
  );

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load companies: {error instanceof Error ? error.message : 'Unknown error'}
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
        searchPlaceholder="Search companies…"
        filters={companyFilters}
        emptyState="No companies yet. Add your first one to get started."
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`/companies/${c.id}`)}
        onSelectionChange={setSelected}
        enableRowRangeSelect
        hideSelectColumn
        footerActions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              Add Company
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex items-center gap-2">
            <Button size="lg" variant="outline" onClick={handleExport} disabled={isExporting}>
              <Download />
              {isExporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
            {selected.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="lg" disabled={isBulkUpdating}>
                      {isBulkUpdating ? 'Updating…' : `Bulk actions (${selected.length})`}
                      <ChevronDown />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {canUpdate ? (
                    <>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Tag />
                          Set status
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-48">
                          {statusOptions.map((o) => (
                            <DropdownMenuItem key={o.value} onClick={() => handleBulkSetStatus(o.value as ClientStatus)}>
                              <Badge className={o.triggerClassName}>{o.label}</Badge>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Tag />
                          Set quality
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-48">
                          {qualityOptions.map((o) => (
                            <DropdownMenuItem key={o.value} onClick={() => handleBulkSetQuality(o.value as ClientQuality)}>
                              <Badge className={o.triggerClassName}>{o.label}</Badge>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  ) : null}
                  {canDelete ? (
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
        selectionContextMenu={
          <>
            <ContextMenuItem onClick={handleExport}>
              <Download />
              Export to Excel
            </ContextMenuItem>
            {canUpdate ? (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Tag />
                    Set status
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="min-w-48">
                    {statusOptions.map((o) => (
                      <ContextMenuItem key={o.value} onClick={() => handleBulkSetStatus(o.value as ClientStatus)}>
                        <Badge className={o.triggerClassName}>{o.label}</Badge>
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Tag />
                    Set quality
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="min-w-48">
                    {qualityOptions.map((o) => (
                      <ContextMenuItem key={o.value} onClick={() => handleBulkSetQuality(o.value as ClientQuality)}>
                        <Badge className={o.triggerClassName}>{o.label}</Badge>
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </>
            ) : null}
            {canDelete ? (
              <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 />
                Delete
              </ContextMenuItem>
            ) : null}
          </>
        }
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
          infiniteScroll: true,
          isFetchingNextPage: isFetching && page > 1,
        }}
      />

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${selected.length} compan${selected.length === 1 ? 'y' : 'ies'}?`}
        description="You can undo this from the toast right after, or it's gone for good."
        onConfirm={handleBulkDelete}
      />

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full sm:max-w-md">
          {creating ? (
            <CompanyForm
              title="Add company"
              description="Add a new client company."
              industries={industries}
              onCreateIndustry={handleCreateIndustry}
              onCreateSpecialization={async (name, industryId) => {
                const res = await createSpecialization.mutateAsync({ data: { name, industryId } });
                if (res.status !== 201) throw new Error('Failed to add specialization');
                return res.data;
              }}
              isSaving={createCompanyMutation.isPending}
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** "Add company" drawer form — company name, industry and at least one market location are required (mirrors CreateClientDto). Editing an existing company happens on its detail page (/companies/[id]), not here. */
function CompanyForm({
  title,
  description,
  industries,
  onCreateIndustry,
  onCreateSpecialization,
  isSaving,
  onSave,
  onCancel,
}: {
  title: string;
  description: string;
  industries: { id: string; name: string }[];
  onCreateIndustry: (name: string) => Promise<{ id: string; name: string }>;
  onCreateSpecialization: (name: string, industryId: string) => Promise<SpecializationOption>;
  isSaving: boolean;
  onSave: (values: CompanyFormValues) => void;
  onCancel: () => void;
}) {
  const [companyName, setCompanyName] = React.useState('');
  const [industryId, setIndustryId] = React.useState('');
  const [specializationId, setSpecializationId] = React.useState('');
  const [locations, setLocations] = React.useState<LocationOption[]>([]);
  const [addresses, setAddresses] = React.useState('');
  const [suburbsAndPostcodes, setSuburbsAndPostcodes] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [seekJobMarketUrl, setSeekJobMarketUrl] = React.useState('');
  const [linkedinJobMarketUrl, setLinkedinJobMarketUrl] = React.useState('');
  const [generalDescription, setGeneralDescription] = React.useState('');
  const [status, setStatus] = React.useState<ClientStatus>('COLD');
  const [quality, setQuality] = React.useState<ClientQuality>('MEDIUM');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      companyName,
      industryId,
      specializationId,
      locations,
      addresses,
      suburbsAndPostcodes,
      website,
      seekJobMarketUrl,
      linkedinJobMarketUrl,
      generalDescription,
      status,
      quality,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company name" htmlFor="company-name" required>
          <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </FormField>
        <FormField label="Industry" htmlFor="company-industry" required>
          <CreatableCombobox
            id="company-industry"
            value={industryId}
            onValueChange={(id) => {
              setIndustryId(id);
              setSpecializationId('');
            }}
            options={industries}
            onCreate={onCreateIndustry}
          />
        </FormField>
        <FormField
          label="Specialization"
          htmlFor="company-specialization"
          description={!industryId ? 'Pick an industry first' : undefined}
        >
          <SpecializationCombobox
            id="company-specialization"
            value={specializationId}
            onValueChange={setSpecializationId}
            industryId={industryId || undefined}
            onCreate={(name) => onCreateSpecialization(name, industryId)}
            disabled={!industryId}
            clearable
          />
        </FormField>
        <FormField
          label="Market"
          htmlFor="company-market"
          required
          description="Which places this client hires from — its market, not its office address."
        >
          <LocationMultiSelect
            id="company-market"
            selected={locations}
            onChange={setLocations}
            placeholder="Search locations…"
          />
        </FormField>
        <FormField label="Website" htmlFor="company-website">
          <Input id="company-website" type="url" placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </FormField>
        <FormField
          label="Status"
          htmlFor="company-status"
          description="Relationship status. Defaults to Cold for a new lead."
        >
          <EnumSelect id="company-status" value={status} onValueChange={(v) => setStatus(v as ClientStatus)} options={statusOptions} />
        </FormField>
        <FormField label="Quality" htmlFor="company-quality" description="A subjective read on how good a prospect this is.">
          <EnumSelect id="company-quality" value={quality} onValueChange={(v) => setQuality(v as ClientQuality)} options={qualityOptions} />
        </FormField>
        <FormField label="Office address(es)" htmlFor="company-addresses" description="One per line — distinct from Market above.">
          <textarea
            id="company-addresses"
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
        <FormField label="Suburbs / postcodes" htmlFor="company-suburbs" description="One per line.">
          <textarea
            id="company-suburbs"
            value={suburbsAndPostcodes}
            onChange={(e) => setSuburbsAndPostcodes(e.target.value)}
            className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
        <FormField label="Seek / Job Street URL" htmlFor="company-seek">
          <Input id="company-seek" type="url" placeholder="https://…" value={seekJobMarketUrl} onChange={(e) => setSeekJobMarketUrl(e.target.value)} />
        </FormField>
        <FormField label="LinkedIn job market URL" htmlFor="company-linkedin">
          <Input
            id="company-linkedin"
            type="url"
            placeholder="https://…"
            value={linkedinJobMarketUrl}
            onChange={(e) => setLinkedinJobMarketUrl(e.target.value)}
          />
        </FormField>
        <FormField label="Description" htmlFor="company-description">
          <textarea
            id="company-description"
            value={generalDescription}
            onChange={(e) => setGeneralDescription(e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving || !companyName || !industryId || locations.length === 0}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </SheetFooter>
    </form>
  );
}
