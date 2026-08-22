'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { BookA, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { EnumSelect } from '@/components/EnumSelect';
import { LocationFilterButton } from '@/components/LocationMultiSelect';
import { SpecializationFilterButton } from '@/components/SpecializationPicker';
import { getGetClientsQueryKey, useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetJobResearchQueryKey,
  useCreateJobResearch,
} from '@/lib/api/generated/job-research/job-research';
import { getGetJobTitlesQueryKey, useCreateJobTitle, useGetJobTitles } from '@/lib/api/generated/job-titles/job-titles';
import { useGetMe } from '@/lib/api/generated/consultants/consultants';
import { getLocation } from '@/lib/api/generated/locations/locations';
import { buildJobResearchPayload, JobResearchForm, type JobResearchFormValues } from './JobResearchForm';
import { JobResearchTable } from './JobResearchTable';
import {
  jobResearchStatusLabels,
  jobResearchStatusVariants,
  jobResearchStatuses,
  sortByOptions,
  type JobResearchAppliedFilters,
  type JobResearchStatus,
  type SortByValue,
} from './schema';

/** How long Reset fades the results area + its own button out before actually clearing state. */
const RESET_FADE_MS = 200;

const statusOptions = jobResearchStatuses.map((value) => ({
  value,
  label: jobResearchStatusLabels[value],
  variant: jobResearchStatusVariants[value],
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
 * Job Orders Search is search-gated, same as Companies: the table never
 * mounts (so no query ever fires) until the user explicitly commits the
 * action bar's selections with "View" — same reasoning as
 * CompaniesSearchGate, labeled "View" rather than "Search" since this list is
 * market research (job ads found online), not a name-searchable roster.
 */
export function JobResearchSearchGate({ canCreate }: { canCreate: boolean }) {
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

  // `take: 200` (the endpoint's max) rather than the 50 default — same
  // fallback-catalog reasoning as CandidateForm's role type picker.
  const { data: jobTitlesData } = useGetJobTitles({ take: 200 });
  const jobTitles = jobTitlesData?.status === 200 ? jobTitlesData.data : [];

  const { data: clientsData } = useGetClients({ pageSize: 100 });
  const clients = clientsData?.status === 200 ? clientsData.data.data : [];

  // Add-job-order lives here (not JobResearchTable) specifically so the
  // global header's "Add Job Order" button works even before the gate's own
  // table has ever mounted — same reasoning as CompaniesSearchGate's create sheet.
  const [creating, setCreating] = React.useState(false);

  // Opened via the global header's "Add Job Order" button, or the command
  // palette's "Add a Job Order" action (both navigate to
  // `/job-orders-search?new=1`) — strip the param immediately so
  // refresh/back doesn't reopen the sheet.
  React.useEffect(() => {
    if (canCreate && searchParams.get('new') === '1') {
      setCreating(true);
      router.replace('/job-orders-search');
    }
  }, [canCreate, searchParams, router]);

  const createJobTitle = useCreateJobTitle({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetJobTitlesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add job title'),
    },
  });
  async function handleCreateJobTitle(name: string) {
    const res = await createJobTitle.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add job title');
    return res.data;
  }

  const createJobResearchMutation = useCreateJobResearch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobResearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        toast.success('Job order added');
        setCreating(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to add job order'),
    },
  });
  function handleCreate(values: JobResearchFormValues) {
    createJobResearchMutation.mutate({ data: buildJobResearchPayload(values) });
  }

  const [appliedFilters, setAppliedFilters] = React.useState<JobResearchAppliedFilters | null>(null);

  // Default the action bar's selections (not the search itself — the user
  // still clicks View) to the logged-in consultant's own scope grants
  // (Industry/Specialization/Location — see docs/scope-explained.md), so
  // their own patch is one click away instead of built from scratch.
  // No-ops for admin/manager/etc., whose grant arrays are normally empty
  // (scoping only restricts the `consultant` role). Ref-guarded to run
  // exactly once — after that, the fields are the user's to change freely.
  const seededFromScopeRef = React.useRef(false);
  const { data: meData } = useGetMe();
  const me = meData?.status === 200 ? meData.data : undefined;

  React.useEffect(() => {
    if (!me || seededFromScopeRef.current) return;
    seededFromScopeRef.current = true;

    const scopeIndustryIds = me.industryIds ?? [];
    const scopeSpecializationIds = me.specializationIds ?? [];
    const scopeSpecializationNames = me.specializations ?? [];
    const scopeLocationIds = me.locationIds ?? [];
    const scopeLocationNames = me.locations ?? [];
    if (scopeIndustryIds.length === 0 && scopeSpecializationIds.length === 0 && scopeLocationIds.length === 0) return;

    setIndustryIds(scopeIndustryIds);
    setSpecializationIds(scopeSpecializationIds);
    scopeSpecializationIds.forEach((id, i) => {
      if (scopeSpecializationNames[i]) registerSpecializationName(id, scopeSpecializationNames[i]);
    });

    let cancelled = false;
    // Location grants carry no level of their own here (Consultant.locations
    // is a flat, mixed-rung list — see the schema doc) — the Country/City
    // dropdowns are level-scoped, so each grant needs a lookup to know which
    // one it belongs in. STATE/SUBURB grants aren't representable in this
    // two-dropdown bar and are left out of the default seed (still pickable
    // by hand).
    Promise.all(scopeLocationIds.map((id) => getLocation(id).catch(() => null))).then((results) => {
      if (cancelled) return;
      const nextCountryIds: string[] = [];
      const nextCityIds: string[] = [];
      results.forEach((res, i) => {
        const id = scopeLocationIds[i];
        const location = res?.status === 200 ? res.data : undefined;
        const name = location?.name ?? scopeLocationNames[i];
        if (location?.level === 'COUNTRY') {
          nextCountryIds.push(id);
          if (name) registerCountryName(id, name);
        } else if (location?.level === 'CITY') {
          nextCityIds.push(id);
          if (name) registerCityName(id, name);
        }
      });
      setCountryIds(nextCountryIds);
      setCityIds(nextCityIds);
    });
    return () => {
      cancelled = true;
    };
  }, [me, registerSpecializationName, registerCountryName, registerCityName]);

  const hasActiveFilters =
    countryIds.length > 0 ||
    cityIds.length > 0 ||
    industryIds.length > 0 ||
    specializationIds.length > 0 ||
    statuses.length > 0 ||
    sortByValue !== '';

  function handleView() {
    const locationIds = [...countryIds, ...cityIds];
    const sort = sortByOptions.find((o) => o.value === sortByValue);
    setAppliedFilters({
      statuses: statuses.length ? (statuses as JobResearchStatus[]) : undefined,
      industryIds: industryIds.length ? industryIds : undefined,
      specializationIds: specializationIds.length ? specializationIds : undefined,
      locationIds: locationIds.length ? locationIds : undefined,
      sortBy: sort?.sortBy,
      sortOrder: sort?.sortOrder,
    });
  }

  // Undoes the search entirely, not just the draft selections — leaving
  // results on screen for filters the action bar no longer shows as active
  // would be confusing, so this drops back to the "no job orders displayed
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
    <div className="flex flex-col gap-4">
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
              id="job-research-sort"
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
          <Button onClick={handleView}>
            <Search />
            View
          </Button>
        </div>
      </div>

      <div className={cn('transition-opacity duration-200', isResetting && 'pointer-events-none opacity-0')}>
        {appliedFilters ? (
          <JobResearchTable filters={appliedFilters} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-24 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookA className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">No job orders displayed yet</p>
              <p className="text-sm text-muted-foreground">Select your preferences above to view matching job orders.</p>
            </div>
          </div>
        )}
      </div>

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full sm:max-w-md">
          {creating ? (
            <JobResearchForm
              title="Add Job Orders Research"
              description="Log a job ad found in the market."
              clients={clients}
              jobTitles={jobTitles}
              onCreateJobTitle={handleCreateJobTitle}
              isSaving={createJobResearchMutation.isPending}
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
