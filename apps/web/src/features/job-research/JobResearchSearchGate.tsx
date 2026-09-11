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
import { LocationFilterButton } from '@/components/LocationMultiSelect';
import { SpecializationFilterButton } from '@/components/SpecializationPicker';
import { useGateSnapshot, usePersistGateSnapshot } from '@/hooks/use-gate-snapshot';
import { useSeedFiltersFromScope } from '@/hooks/use-seed-filters-from-scope';
import { getGetClientsQueryKey } from '@/lib/api/generated/clients/clients';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetJobResearchQueryKey,
  useCreateJobResearch,
} from '@/lib/api/generated/job-research/job-research';
import { getGetJobTitlesQueryKey, useCreateJobTitle } from '@/lib/api/generated/job-titles/job-titles';
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
 * Job Opening Search is search-gated, same as Companies: the table never
 * mounts (so no query ever fires) until the user explicitly commits the
 * action bar's selections with "View" — same reasoning as
 * CompaniesSearchGate, labeled "View" rather than "Search" since this list is
 * market research (job ads found online), not a name-searchable roster.
 * Job Title / Company filters live on the table columns, not this gate.
 */
/** What `useGateSnapshot` persists for this page — see its doc. */
interface JobResearchGateSnapshot {
  countryIds: string[];
  cityIds: string[];
  industryIds: string[];
  specializationIds: string[];
  statuses: string[];
  sortByValue: SortByValue | '';
  countryNames: Record<string, string>;
  cityNames: Record<string, string>;
  specializationNames: Record<string, string>;
  appliedFilters: JobResearchAppliedFilters | null;
}

const GATE_SNAPSHOT_KEY = 'job-research-gate-snapshot';

export function JobResearchSearchGate({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Returning from the Enrich Stakeholders workspace
  // (`/job-opening-search?restore=1`) puts the page back exactly as it was
  // left, rather than dropping the user on the empty "select your
  // preferences" gate having lost their search.
  const restoring = searchParams.get('restore') === '1';
  const snapshot = useGateSnapshot<JobResearchGateSnapshot>(GATE_SNAPSHOT_KEY, restoring);

  const [countryIds, setCountryIds] = React.useState<string[]>(snapshot?.countryIds ?? []);
  const [cityIds, setCityIds] = React.useState<string[]>(snapshot?.cityIds ?? []);
  const [industryIds, setIndustryIds] = React.useState<string[]>(snapshot?.industryIds ?? []);
  const [specializationIds, setSpecializationIds] = React.useState<string[]>(
    snapshot?.specializationIds ?? [],
  );
  const [statuses, setStatuses] = React.useState<string[]>(snapshot?.statuses ?? []);
  const [sortByValue, setSortByValue] = React.useState<SortByValue | ''>(snapshot?.sortByValue ?? '');

  // Country/City/Specialization are server-searched (see LocationFilterButton
  // /SpecializationFilterButton) — the API only returns a name alongside a
  // live search result, not by id, so each is cached here as the user
  // searches, same reasoning as CompaniesSearchGate's resolver maps.
  const [countryNames, setCountryNames] = React.useState<Record<string, string>>(
    snapshot?.countryNames ?? {},
  );
  const registerCountryName = React.useCallback(
    (id: string, name: string) => setCountryNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [cityNames, setCityNames] = React.useState<Record<string, string>>(
    snapshot?.cityNames ?? {},
  );
  const registerCityName = React.useCallback(
    (id: string, name: string) => setCityNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [specializationNames, setSpecializationNames] = React.useState<Record<string, string>>(
    snapshot?.specializationNames ?? {},
  );
  const registerSpecializationName = React.useCallback(
    (id: string, name: string) =>
      setSpecializationNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );

  const { data: industriesData } = useGetIndustries();
  const industries = industriesData?.status === 200 ? industriesData.data : [];
  const industryOptions = React.useMemo(() => industries.map((i) => ({ value: i.id, label: i.name })), [industries]);

  // Add-job-order lives here (not JobResearchTable) specifically so the
  // command palette's "Add a Job Order" action works even before the gate's
  // own table has ever mounted — same reasoning as CompaniesSearchGate's
  // create sheet.
  const [creating, setCreating] = React.useState(false);

  // Opened via the command palette's "Add a Job Order" action (navigates to
  // `/job-opening-search?new=1`) — strip the param immediately so
  // refresh/back doesn't reopen the sheet.
  React.useEffect(() => {
    if (canCreate && searchParams.get('new') === '1') {
      setCreating(true);
      router.replace('/job-opening-search');
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

  const [appliedFilters, setAppliedFilters] = React.useState<JobResearchAppliedFilters | null>(
    snapshot?.appliedFilters ?? null,
  );

  usePersistGateSnapshot(GATE_SNAPSHOT_KEY, {
    countryIds,
    cityIds,
    industryIds,
    specializationIds,
    statuses,
    sortByValue,
    countryNames,
    cityNames,
    specializationNames,
    appliedFilters,
  } satisfies JobResearchGateSnapshot);

  useSeedFiltersFromScope({
    setIndustryIds,
    setSpecializationIds,
    registerSpecializationName,
    setCountryIds,
    setCityIds,
    registerCountryName,
    registerCityName,
    skip: snapshot !== null,
  });

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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
          <FilterField label="City Coverage">
            <LocationFilterButton
              selected={cityIds}
              onChange={setCityIds}
              level="CITY_COVERAGE"
              underId={countryIds.length === 1 ? countryIds[0] : undefined}
              compact={false}
              placeholder="All City Coverage"
              title="City Coverage"
              labelFor={(id) => cityNames[id] ?? id}
              onResolve={registerCityName}
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
          <Button onClick={handleView}>
            <Search />
            View
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
