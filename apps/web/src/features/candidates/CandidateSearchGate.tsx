'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { LocationFilterButton } from '@/components/LocationMultiSelect';
import { SpecializationFilterButton } from '@/components/SpecializationPicker';
import { getGetIndustriesQueryKey, useCreateIndustry, useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetJobRoleTypesQueryKey,
  useCreateJobRoleType,
  useGetJobRoleTypes,
} from '@/lib/api/generated/job-role-types/job-role-types';
import {
  getGetCandidatesQueryKey,
  useCreateCandidate,
  useGetCandidateJobRoleTypeFacets,
} from '@/lib/api/generated/candidates/candidates';
import type { GetCandidatesParams } from '@/lib/api/generated/types';
import { useSeedFiltersFromScope } from '@/hooks/use-seed-filters-from-scope';
import { RoleTypeFilter } from './RoleTypeFilter';
import { buildCandidatePayload, CandidateForm, type CandidateFormValues } from './CandidateForm';
import { CandidatesTable } from './CandidatesTable';
import {
  candidateStatuses,
  candidateStatusLabels,
  candidateStatusVariants,
  sortByOptions,
  type CandidateAppliedFilters,
  type CandidateStatus,
  type SortByValue,
} from './schema';

/** How long Reset fades the results area + its own button out before actually clearing state. */
const RESET_FADE_MS = 200;

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
  variant: candidateStatusVariants[value],
}));

/** Label + control, stacked — same shape as CompaniesSearchGate's inline filter labels. */
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Candidates is search-gated, same as Companies: the table never mounts (so
 * no query ever fires) until the user explicitly commits the action bar's
 * selections with "Search" — this dataset is large enough (~4k rows) that
 * landing on an unfiltered "everything" page isn't a useful default.
 * Re-clicking Search with the same selections still counts as a fresh commit
 * (a new `filters` object, even if shallow-equal) — see CandidatesTable's
 * page-reset effect.
 */
export function CandidateSearchGate({
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
  const [jobRoleTypeIds, setJobRoleTypeIds] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [sortByValue, setSortByValue] = React.useState<SortByValue | ''>('');

  // Country/City/Specialization are server-searched (see LocationFilterButton
  // /SpecializationFilterButton) — the API only returns a name alongside a
  // live search result, not by id, so each is cached here as the user
  // searches, same reasoning as CompaniesSearchGate's resolver maps.
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

  // `take: 200` (the endpoint's max) rather than the 50 default — this
  // catalog is 259 rows; `jobRoleTypeFacets` below is the one that actually
  // has to be complete for chip/trigger labels, this is just a fallback.
  const { data: roleTypesData } = useGetJobRoleTypes({ take: 200 });
  const roleTypes = roleTypesData?.status === 200 ? roleTypesData.data : [];

  // Add-candidate lives here (not CandidatesTable) specifically so the global
  // header's "Add Candidate" button works even before the gate's own table
  // has ever mounted — same reasoning as CompaniesSearchGate's create sheet.
  const [creating, setCreating] = React.useState(false);

  // Opened via the global header's "Add Candidate" button, or the command
  // palette's "Add a Candidate" action (both navigate to `/candidates?new=1`)
  // — strip the param immediately so refresh/back doesn't reopen the sheet.
  React.useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true);
      router.replace('/candidates');
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

  const createRoleType = useCreateJobRoleType({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetJobRoleTypesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add role type'),
    },
  });
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    return res.data;
  }

  const createCandidateMutation = useCreateCandidate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        toast.success('Candidate added');
        setCreating(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to add candidate'),
    },
  });
  function handleCreate(values: CandidateFormValues) {
    createCandidateMutation.mutate({ data: buildCandidatePayload(values) });
  }

  // Job Role Type option counts reflect the draft selections in this bar,
  // live — "if I also picked this" — computed server-side against every
  // other field currently set, same as the field's own doc.
  const jobRoleTypeFacetQuery: GetCandidatesParams = {
    statuses: statuses.length ? (statuses as CandidateStatus[]) : undefined,
    industryIds: industryIds.length ? industryIds : undefined,
    specializationIds: specializationIds.length ? specializationIds : undefined,
    locationIds: countryIds.length || cityIds.length ? [...countryIds, ...cityIds] : undefined,
  };
  // `placeholderData: keepPreviousData` — without it, TanStack Query drops
  // `data` to undefined on every query-key change (any of statuses/industry/
  // specialization/location changing), which briefly emptied `jobRoleTypeFacets`
  // below and made the Role Type filter's selected chips flash blank (e.g.
  // right after picking a City). Keeping the previous facets visible while
  // the new ones load fixes that.
  const { data: jobRoleTypeFacetsData } = useGetCandidateJobRoleTypeFacets(jobRoleTypeFacetQuery, {
    query: { placeholderData: keepPreviousData },
  });
  const jobRoleTypeFacets = React.useMemo(
    () => (jobRoleTypeFacetsData?.status === 200 ? jobRoleTypeFacetsData.data : []),
    [jobRoleTypeFacetsData],
  );
  const jobRoleTypeName = React.useCallback(
    (id: string) => jobRoleTypeFacets.find((f) => f.id === id)?.name ?? roleTypes.find((r) => r.id === id)?.name ?? id,
    [jobRoleTypeFacets, roleTypes],
  );

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
    jobRoleTypeIds.length > 0 ||
    statuses.length > 0 ||
    sortByValue !== '';

  const [appliedFilters, setAppliedFilters] = React.useState<CandidateAppliedFilters | null>(null);

  function handleSearch() {
    const locationIds = [...countryIds, ...cityIds];
    const sort = sortByOptions.find((o) => o.value === sortByValue);
    setAppliedFilters({
      statuses: statuses.length ? (statuses as CandidateStatus[]) : undefined,
      industryIds: industryIds.length ? industryIds : undefined,
      jobRoleTypeIds: jobRoleTypeIds.length ? jobRoleTypeIds : undefined,
      specializationIds: specializationIds.length ? specializationIds : undefined,
      locationIds: locationIds.length ? locationIds : undefined,
      sortBy: sort?.sortBy,
      sortOrder: sort?.sortOrder,
    });
  }

  // Undoes the search entirely, not just the draft selections — leaving
  // results on screen for filters the action bar no longer shows as active
  // would be confusing, so this drops back to the "no candidates displayed
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
      setJobRoleTypeIds([]);
      setStatuses([]);
      setSortByValue('');
      setAppliedFilters(null);
      setIsResetting(false);
    }, RESET_FADE_MS);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
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
              placeholder="All industries"
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
              industryIds={industryIds}
            />
          </FilterField>
          <FilterField label="City">
            <LocationFilterButton
              selected={cityIds}
              onChange={setCityIds}
              level="CITY"
              underId={countryIds.length === 1 ? countryIds[0] : undefined}
              compact={false}
              placeholder="All cities"
              title="City"
              labelFor={(id) => cityNames[id] ?? id}
              onResolve={registerCityName}
            />
          </FilterField>
          <FilterField label="Role Type">
            <RoleTypeFilter
              selected={jobRoleTypeIds}
              onChange={setJobRoleTypeIds}
              facets={jobRoleTypeFacets}
              labelFor={jobRoleTypeName}
            />
          </FilterField>
          <FilterField label="Status">
            <DataGridFacetedFilter
              title="Status"
              placeholder="All statuses"
              options={statusOptions}
              selected={statuses}
              onChange={setStatuses}
              triggerClassName="w-full justify-between"
            />
          </FilterField>
          <FilterField label="Sorted By">
            <DataGridFacetedFilter
              title="Sorted By"
              placeholder="Default order"
              single
              options={sortByOptions}
              selected={sortByValue ? [sortByValue] : []}
              onChange={(values) => setSortByValue((values[0] as SortByValue) ?? '')}
              triggerClassName="w-full justify-between"
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
          <CandidatesTable filters={appliedFilters} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-24 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">No candidates displayed yet</p>
              <p className="text-sm text-muted-foreground">Select your preferences to view matching candidates.</p>
            </div>
          </div>
        )}
      </div>

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full sm:max-w-md">
          {creating ? (
            <CandidateForm
              title="Add candidate"
              description="Add a new candidate."
              industries={industries}
              roleTypes={roleTypes}
              onCreateIndustry={handleCreateIndustry}
              onCreateRoleType={handleCreateRoleType}
              isSaving={createCandidateMutation.isPending}
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
