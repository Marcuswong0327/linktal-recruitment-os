'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { EnumSelect } from '@/components/EnumSelect';
import { LocationFilterButton } from '@/components/LocationMultiSelect';
import { SpecializationFilterButton } from '@/components/SpecializationPicker';
import { getGetClientsQueryKey, useCreateClient } from '@/lib/api/generated/clients/clients';
import { getGetIndustriesQueryKey, useCreateIndustry, useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
} from '@/lib/api/generated/specializations/specializations';
import { useSeedFiltersFromScope } from '@/hooks/use-seed-filters-from-scope';
import { buildCompanyPayload, CompanyForm, type CompanyFormValues } from './CompanyForm';
import { CompaniesTable } from './CompaniesTable';
import {
  sortByOptions,
  statusOptions,
  type ClientStatus,
  type CompanyAppliedFilters,
  type SortByValue,
} from './schema';

/** How long Reset fades the results area + its own button out before actually clearing state. */
const RESET_FADE_MS = 200;

/** Label + control, stacked — same shape as CandidateSearchGate's inline filter labels. */
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Companies is search-gated, unlike every other DataGrid page: the table
 * never mounts (so no query ever fires) until the user explicitly commits
 * the action bar's selections with "Search" — the client list is large
 * enough that landing on an unfiltered "everything" page isn't a useful
 * default. Re-clicking Search with the same selections still counts as a
 * fresh commit (a new `filters` object, even if shallow-equal) — see
 * CompaniesTable's page-reset effect.
 */
export function CompaniesSearchGate({
  canCreate,
  canUpdate,
  canDelete,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [countryIds, setCountryIds] = React.useState<string[]>([]);
  const [cityIds, setCityIds] = React.useState<string[]>([]);
  const [industryIds, setIndustryIds] = React.useState<string[]>([]);
  const [specializationIds, setSpecializationIds] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [sortByValue, setSortByValue] = React.useState<SortByValue | ''>('');

  // Country/City/Specialization are server-searched (see LocationFilterButton
  // /SpecializationFilterButton) — the API only returns a name alongside a
  // live search result, not by id, so each is cached here as the user
  // searches, same reasoning as CandidateSearchGate's resolver maps.
  const [countryNames, setCountryNames] = React.useState<Record<string, string>>({});
  const registerCountryName = React.useCallback(
    (id: string, name: string) => setCountryNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [cityNames, setCityNames] = React.useState<Record<string, string>>({});
  const registerCityName = React.useCallback(
    (id: string, name: string) => setCityNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [specializationNames, setSpecializationNames] = React.useState<Record<string, string>>({});
  const registerSpecializationName = React.useCallback(
    (id: string, name: string) =>
      setSpecializationNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );

  const { data: industriesData } = useGetIndustries();
  const industries = industriesData?.status === 200 ? industriesData.data : [];
  const industryOptions = React.useMemo(() => industries.map((i) => ({ value: i.id, label: i.name })), [industries]);

  // Add-company lives here (not CompaniesTable) specifically so the global
  // header's "Add Company" button works even before the gate's own table has
  // ever mounted — CompaniesTable only exists once a search has been run,
  // but this gate is on screen from the moment the page loads.
  const [creating, setCreating] = React.useState(false);

  // Opened via the global header's "Add Company" button, or the command
  // palette's "Add a Company" action (both navigate to `/companies?new=1`)
  // — strip the param immediately so refresh/back doesn't reopen the sheet.
  React.useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true);
      router.replace('/companies');
    }
  }, [searchParams, router]);

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
  function handleCreate(values: CompanyFormValues) {
    createCompanyMutation.mutate({ data: buildCompanyPayload(values) });
  }

  const [appliedFilters, setAppliedFilters] = React.useState<CompanyAppliedFilters | null>(null);

  useSeedFiltersFromScope({
    setIndustryIds,
    setSpecializationIds,
    registerSpecializationName,
    setCountryIds,
    setCityIds,
    registerCountryName,
    registerCityName,
  });

  const hasActiveFilters =
    countryIds.length > 0 ||
    cityIds.length > 0 ||
    industryIds.length > 0 ||
    specializationIds.length > 0 ||
    statuses.length > 0 ||
    sortByValue !== '';

  function handleSearch() {
    const locationIds = [...countryIds, ...cityIds];
    const sort = sortByOptions.find((o) => o.value === sortByValue);
    setAppliedFilters({
      statuses: statuses.length ? (statuses as ClientStatus[]) : undefined,
      industryIds: industryIds.length ? industryIds : undefined,
      specializationIds: specializationIds.length ? specializationIds : undefined,
      locationIds: locationIds.length ? locationIds : undefined,
      sortBy: sort?.sortBy,
      sortOrder: sort?.sortOrder,
    });
  }

  // Undoes the search entirely, not just the draft selections — leaving
  // results on screen for filters the action bar no longer shows as active
  // would be confusing, so this drops back to the "no companies displayed
  // yet" gate state too. Fades the results area and the Reset button itself
  // out first, then clears state once the fade finishes (RESET_FADE_MS) —
  // clearing immediately would just snap both away with no transition to
  // actually see.
  const [isResetting, setIsResetting] = React.useState(false);
  function handleReset() {
    if (isResetting) return;
    setIsResetting(true);
    window.setTimeout(() => {
      setCountryIds([]);
      setCityIds([]);
      setIndustryIds([]);
      setSpecializationIds([]);
      setStatuses([]);
      setSortByValue('');
      setAppliedFilters(null);
      setIsResetting(false);
    }, RESET_FADE_MS);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FilterField label="Country">
            <LocationFilterButton
              selected={countryIds}
              onChange={setCountryIds}
              level="COUNTRY"
              browsable
              compact={false}
              placeholder="All countries"
              title="Country"
              labelFor={(id) => countryNames[id] ?? id}
              onResolve={registerCountryName}
            />
          </FilterField>
          <FilterField label="Industry">
            <DataGridFacetedFilter
              title="Industry"
              options={industryOptions}
              selected={industryIds}
              onChange={setIndustryIds}
              triggerClassName="w-full justify-between"
            />
          </FilterField>
          <FilterField label="Specialization">
            <SpecializationFilterButton
              selected={specializationIds}
              onChange={setSpecializationIds}
              compact={false}
              placeholder="All specializations"
              title="Specialization"
              labelFor={(id) => specializationNames[id] ?? id}
              onResolve={registerSpecializationName}
            />
          </FilterField>
          <FilterField label="City">
            <LocationFilterButton
              selected={cityIds}
              onChange={setCityIds}
              level="CITY"
              compact={false}
              placeholder="All cities"
              title="City"
              labelFor={(id) => cityNames[id] ?? id}
              onResolve={registerCityName}
            />
          </FilterField>
          <FilterField label="Status">
            <DataGridFacetedFilter
              title="Status"
              options={statusOptions}
              selected={statuses}
              onChange={setStatuses}
              triggerClassName="w-full justify-between"
            />
          </FilterField>
          <FilterField label="Sorted By">
            <EnumSelect
              id="companies-sort"
              value={sortByValue}
              onValueChange={(v) => setSortByValue(v as SortByValue)}
              options={sortByOptions}
              placeholder="Select sorting"
            />
          </FilterField>
        </div>
        <div className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isResetting}
              className={cn('transition-opacity duration-200', isResetting && 'pointer-events-none opacity-0')}
            >
              <X />
              Reset
            </Button>
          ) : null}
          <Button onClick={handleSearch}>
            <Search />
            Search
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col transition-opacity duration-200',
          isResetting && 'pointer-events-none opacity-0',
        )}
      >
        {appliedFilters ? (
          <CompaniesTable filters={appliedFilters} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-24 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Building2 className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">No companies displayed yet</p>
              <p className="text-sm text-muted-foreground">Select your preferences above to view matching companies.</p>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
}
