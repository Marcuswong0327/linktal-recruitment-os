'use client';

import * as React from 'react';
import { useSession } from 'next-auth/react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageHeader } from '@/components/app-shell/PageLayout';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import { useGetJobRoleTypes } from '@/lib/api/generated/job-role-types/job-role-types';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { useGetCandidateJobRoleTypeFacets } from '@/lib/api/generated/candidates/candidates';
import type { GetCandidatesParams, JobRoleTypeFacetEntity } from '@/lib/api/generated/types';
import { CandidateSearchBar } from './CandidateSearchBar';
import { RoleTypeFilter } from './RoleTypeFilter';
import { LocationFilter } from './LocationFilter';
import { CatalogMultiSelectFilter } from './CatalogMultiSelectFilter';
import { CandidatesTable } from './CandidatesTable';
import { candidateStatuses, candidateStatusLabels, candidateStatusVariants } from './schema';
import { type CandidateFilterState, useCandidateSearch } from './useCandidateSearch';

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
  variant: candidateStatusVariants[value],
}));

/** Unions array fields, overwrites scalar ones — how a picked search-bar suggestion layers onto whatever's already active (adding "Fitter" from the search bar adds to Role Type, it doesn't replace the whole search). */
function mergeAdditive(prev: CandidateFilterState, patch: Partial<CandidateFilterState>): Partial<CandidateFilterState> {
  const merged: Partial<CandidateFilterState> = { ...patch };
  for (const key of Object.keys(patch) as (keyof CandidateFilterState)[]) {
    const value = patch[key];
    if (Array.isArray(value)) {
      const existing = (prev[key] as unknown as string[] | undefined) ?? [];
      (merged as Record<string, unknown>)[key] = Array.from(new Set([...existing, ...value]));
    }
  }
  return merged;
}

export function CandidateSearchGate({
  canCreate,
  canDelete,
  canUpdate,
}: {
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
}) {
  const { data: session } = useSession();
  const isConsultant = session?.user?.roleName === 'consultant';

  const { data: industriesData } = useGetIndustries();
  const industries = industriesData?.status === 200 ? industriesData.data : [];
  // `take: 200` (the endpoint's max) rather than the 50 default — this
  // catalog is 259 rows and genuinely paginated by design (the API doc:
  // "the combobox asks for a page ... not the whole table"), so this is
  // still a best-effort fallback, not a guarantee. `facets` below (an
  // unbounded groupBy) is the one that actually has to be complete, since
  // it's what resolves the Active Filters chip label for whatever's picked.
  const { data: roleTypesData } = useGetJobRoleTypes({ take: 200 });
  const roleTypes = roleTypesData?.status === 200 ? roleTypesData.data : [];
  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  // Location and Specialization aren't preloaded (~2k location nodes;
  // Specialization is 775+ rows and growing — see CatalogMultiSelectFilter's
  // doc) — both are server-searched as the user types, so chip/trigger
  // labels for an already-selected id cache whatever the respective picker
  // has resolved so far, rather than joining against a full list that
  // doesn't exist client-side.
  const [locationNames, setLocationNames] = React.useState<Record<string, string>>({});
  const registerLocationName = React.useCallback((id: string, name: string) => {
    setLocationNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name }));
  }, []);
  const [specializationNames, setSpecializationNames] = React.useState<Record<string, string>>({});
  const registerSpecializationName = React.useCallback((id: string, name: string) => {
    setSpecializationNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name }));
  }, []);

  // Job Role Type facets need the current filter state (`search.queryParams`)
  // to compute, but `search` itself needs `resolvers` (below) as an
  // argument — so the fetch can't happen before `search` exists. Broken via
  // one extra render: seed from state (starts empty), fetch once `search` is
  // available further down, and sync the result back into this state so
  // `resolvers` picks up a fresh reference and the Active Filters chip
  // relabels correctly once facets resolve.
  const [jobRoleTypeFacets, setJobRoleTypeFacets] = React.useState<JobRoleTypeFacetEntity[]>([]);

  const resolvers = React.useMemo(
    () => ({
      industryName: (id: string) => industries.find((i) => i.id === id)?.name ?? id,
      // Facets (unbounded — every role type with >=1 current match) resolve
      // first; the plain catalog (paginated at up to 200/259) is only a
      // fallback for the rare case of a selection with zero current matches
      // under every other active filter.
      jobRoleTypeName: (id: string) =>
        jobRoleTypeFacets.find((f) => f.id === id)?.name ?? roleTypes.find((r) => r.id === id)?.name ?? id,
      specializationName: (id: string) => specializationNames[id] ?? id,
      consultantName: (id: string) => consultants.find((c) => c.id === id)?.fullName ?? id,
      locationName: (id: string) => locationNames[id] ?? id,
    }),
    [industries, jobRoleTypeFacets, roleTypes, consultants, locationNames, specializationNames],
  );

  const search = useCandidateSearch(resolvers);
  const [searchText, setSearchText] = React.useState('');

  const jobRoleTypeFacetQuery: GetCandidatesParams = {
    q: search.queryParams.q,
    statuses: search.queryParams.statuses,
    industryIds: search.queryParams.industryIds,
    specializationIds: search.queryParams.specializationIds,
    consultantIds: search.queryParams.consultantIds,
    submissionStatuses: search.queryParams.submissionStatuses,
    placementStatuses: search.queryParams.placementStatuses,
    locationIds: search.queryParams.locationIds,
    lastContactedFrom: search.queryParams.lastContactedFrom,
    lastContactedTo: search.queryParams.lastContactedTo,
  };
  const { data: jobRoleTypeFacetsData } = useGetCandidateJobRoleTypeFacets(jobRoleTypeFacetQuery);
  const fetchedJobRoleTypeFacets = React.useMemo(
    () => (jobRoleTypeFacetsData?.status === 200 ? jobRoleTypeFacetsData.data : []),
    [jobRoleTypeFacetsData],
  );
  React.useEffect(() => {
    setJobRoleTypeFacets(fetchedJobRoleTypeFacets);
  }, [fetchedJobRoleTypeFacets]);

  function handleSearchSubmit() {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    // Replaces `q` rather than appending — searching "Smith" after "John"
    // used to concatenate into the literal substring "John Smith", which
    // matches nobody. A second search should replace the first, not stack.
    search.applyFilters({ q: trimmed });
    setSearchText('');
  }

  function handleApplySuggestion(patch: Partial<CandidateFilterState>) {
    search.applyFilters(mergeAdditive(search.filters, patch));
  }

  function applyPreset(preset: 'recentlyAdded' | 'warm') {
    search.clearAll();
    if (preset === 'warm') search.set('statuses', ['WARM']);
  }

  const moreFiltersCount =
    search.filters.industryIds.length +
    search.filters.specializationIds.length +
    search.filters.consultantIds.length +
    search.filters.submissionStatuses.length +
    search.filters.placementStatuses.length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Search Candidates"
        description="Browse every candidate in scope, or narrow with the filters below."
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <CandidateSearchBar
            value={searchText}
            onChange={setSearchText}
            onSubmit={handleSearchSubmit}
            onApplyFilter={handleApplySuggestion}
            lookups={{
              jobRoleTypes: roleTypes,
              industries,
              consultants: consultants.map((c) => ({ id: c.id, name: c.fullName })),
            }}
          />
          <Button onClick={handleSearchSubmit} disabled={!searchText.trim()}>
            Search
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Role Type</span>
            <RoleTypeFilter
              selected={search.filters.jobRoleTypeIds}
              onChange={(values) => search.set('jobRoleTypeIds', values)}
              facets={fetchedJobRoleTypeFacets}
              labelFor={resolvers.jobRoleTypeName}
            />
          </div>
          <DataGridFacetedFilter
            title="Status"
            options={statusOptions}
            selected={search.filters.statuses}
            onChange={(values) => search.set('statuses', values as typeof search.filters.statuses)}
          />
          <LocationFilter
            selected={search.filters.locationIds}
            onChange={(values) => search.set('locationIds', values)}
            labelFor={resolvers.locationName}
            registerLabel={registerLocationName}
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

          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" className="rounded-lg border-dashed border-foreground/40 data-popup-open:border-solid" />
              }
            >
              <SlidersHorizontal className="opacity-60" />
              More filters
              {moreFiltersCount > 0 ? (
                <>
                  <span className="mx-0.5 h-4 w-px bg-border" />
                  <Badge variant="muted" className="rounded-sm px-1 font-normal">
                    {moreFiltersCount}
                  </Badge>
                </>
              ) : null}
              <ChevronDown className="opacity-50" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Industry</span>
                  <DataGridFacetedFilter
                    title="Select industry"
                    options={industries.map((i) => ({ value: i.id, label: i.name }))}
                    selected={search.filters.industryIds}
                    onChange={(values) => search.set('industryIds', values)}
                    triggerClassName="w-full justify-between"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Specialization</span>
                  <CatalogMultiSelectFilter
                    title="Specialization"
                    selected={search.filters.specializationIds}
                    onChange={(values) => search.set('specializationIds', values)}
                    labelFor={resolvers.specializationName}
                    registerLabel={registerSpecializationName}
                  />
                  {search.filters.specializationIds.length > 0 ? (
                    <p className="text-xs text-warning">
                      Only ~5% of candidates have a specialization tagged — this can hide most matches.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Rarely tagged (~5% of candidates) — use Role Type first.</p>
                  )}
                </div>
                {!isConsultant ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Consultant</span>
                    <DataGridFacetedFilter
                      title="Select consultant"
                      options={consultants.map((c) => ({ value: c.id, label: c.fullName }))}
                      selected={search.filters.consultantIds}
                      onChange={(values) => search.set('consultantIds', values)}
                      triggerClassName="w-full justify-between"
                    />
                    <p className="text-xs text-muted-foreground">No candidates are currently assigned to a consultant.</p>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Submission status</span>
                  <DataGridFacetedFilter
                    title="Select submission status"
                    options={[
                      { value: 'SUBMITTED', label: 'Submitted' },
                      { value: 'INTERVIEWING', label: 'Interviewing' },
                      { value: 'REJECTED', label: 'Rejected' },
                      { value: 'PLACED', label: 'Placed' },
                    ]}
                    selected={search.filters.submissionStatuses}
                    onChange={(values) => search.set('submissionStatuses', values as typeof search.filters.submissionStatuses)}
                    triggerClassName="w-full justify-between"
                  />
                  <p className="text-xs text-muted-foreground">Very few candidates have a submission yet.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Placement status</span>
                  <DataGridFacetedFilter
                    title="Select placement status"
                    options={[
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'COMPLETED', label: 'Completed' },
                      { value: 'FAILED', label: 'Failed' },
                    ]}
                    selected={search.filters.placementStatuses}
                    onChange={(values) => search.set('placementStatuses', values as typeof search.filters.placementStatuses)}
                    triggerClassName="w-full justify-between"
                  />
                  <p className="text-xs text-muted-foreground">No candidates have a placement yet.</p>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <span className="mr-0.5 text-muted-foreground">Quick views:</span>
          <button
            type="button"
            onClick={() => applyPreset('recentlyAdded')}
            className="rounded-md px-2 py-1 text-primary transition-colors hover:bg-primary/10"
          >
            Recently added
          </button>
          <button
            type="button"
            onClick={() => applyPreset('warm')}
            className="rounded-md px-2 py-1 text-primary transition-colors hover:bg-primary/10"
          >
            Warm candidates
          </button>
        </div>
      </div>

      {search.chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
          <span className="text-sm font-medium">Active Filters</span>
          {search.chips.map((chip) => (
            <Badge key={chip.key} variant={chip.variant ?? 'secondary'} className="gap-1 py-1">
              {chip.label}
              <button type="button" onClick={chip.remove} aria-label={`Remove ${chip.label}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={search.clearAll}
            className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
            Clear All
          </button>
        </div>
      ) : null}

      <CandidatesTable
        canCreate={canCreate}
        canDelete={canDelete}
        canUpdate={canUpdate}
        search={search}
        consultants={consultants}
      />
    </div>
  );
}
