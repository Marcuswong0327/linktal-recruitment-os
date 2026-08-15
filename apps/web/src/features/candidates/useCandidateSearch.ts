'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  GetCandidatesParams,
  GetCandidatesPlacementStatusesItem,
  GetCandidatesSortBy,
  GetCandidatesSortOrder,
  GetCandidatesStatusesItem,
  GetCandidatesSubmissionStatusesItem,
} from '@/lib/api/generated/types';
import { candidateStatusLabels, candidateStatusVariants } from './schema';

export const submissionStatusLabels: Record<GetCandidatesSubmissionStatusesItem, string> = {
  SUBMITTED: 'Submitted',
  INTERVIEWING: 'Interviewing',
  REJECTED: 'Rejected',
  PLACED: 'Placed',
};

export const placementStatusLabels: Record<GetCandidatesPlacementStatusesItem, string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

/**
 * The filter/search state a candidate search shares between the top search-gate and the results grid.
 *
 * Field names match the API's query params exactly (`jobRoleTypeIds`, not
 * `roleTypeIds`) — the two used to disagree, which silently 400'd the whole
 * page whenever Role Type was picked (the API's `ValidationPipe` rejects
 * unrecognized query keys). Keep it that way; a renamed field here is a
 * renamed field in the URL too (see the (de)serializers below), so a
 * mismatch breaks both the request and any bookmarked/shared search link.
 */
export interface CandidateFilterState {
  q?: string;
  statuses: GetCandidatesStatusesItem[];
  industryIds: string[];
  jobRoleTypeIds: string[];
  specializationIds: string[];
  submissionStatuses: GetCandidatesSubmissionStatusesItem[];
  placementStatuses: GetCandidatesPlacementStatusesItem[];
  /** Hierarchical — matches this node and every descendant via the location tree's ancestor path. */
  locationIds: string[];
  lastContactedFrom?: string;
  lastContactedTo?: string;
  sortBy?: GetCandidatesSortBy;
  sortOrder?: GetCandidatesSortOrder;
}

const EMPTY_STATE: CandidateFilterState = {
  statuses: [],
  industryIds: [],
  jobRoleTypeIds: [],
  specializationIds: [],
  submissionStatuses: [],
  placementStatuses: [],
  locationIds: [],
};

// Every key that round-trips through the URL, and how — kept as one table so
// adding a filter can't update the state shape without also updating the
// (de)serializers. Array fields are comma-joined; nothing here ever contains
// a literal comma (ids, enum values, ISO dates), so no escaping is needed.
const ARRAY_KEYS = [
  'statuses',
  'industryIds',
  'jobRoleTypeIds',
  'specializationIds',
  'submissionStatuses',
  'placementStatuses',
  'locationIds',
] as const satisfies readonly (keyof CandidateFilterState)[];
const SCALAR_KEYS = [
  'q',
  'lastContactedFrom',
  'lastContactedTo',
  'sortBy',
  'sortOrder',
] as const satisfies readonly (keyof CandidateFilterState)[];

/** Reads filter state back out of the URL — what a bookmarked or shared search link restores on load. */
function filtersFromSearchParams(params: URLSearchParams): CandidateFilterState {
  const state: CandidateFilterState = { ...EMPTY_STATE };
  for (const key of ARRAY_KEYS) {
    const raw = params.get(key);
    if (raw) (state[key] as string[]) = raw.split(',').filter(Boolean);
  }
  for (const key of SCALAR_KEYS) {
    const raw = params.get(key);
    if (raw) (state as unknown as Record<string, string>)[key] = raw;
  }
  return state;
}

/** The inverse of the above — every active filter becomes a query param, so the address bar always reflects exactly what's applied. */
function filtersToSearchParams(filters: CandidateFilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ARRAY_KEYS) {
    const values = filters[key] as string[];
    if (values.length) params.set(key, values.join(','));
  }
  for (const key of SCALAR_KEYS) {
    const value = filters[key] as string | undefined;
    if (value) params.set(key, value);
  }
  return params;
}

/** A single removable pill in the Active Filters row. */
export interface FilterChip {
  key: string;
  label: string;
  remove: () => void;
  /** Semantic color for chips with an established one elsewhere (e.g. Status's temperature scale) — plain `secondary` otherwise. */
  variant?: 'info' | 'warning' | 'destructive' | 'success' | 'muted';
}

/** Resolves an id back to a display name for chip labels — supplied by the caller, which already has these lists loaded for the dropdowns. */
export interface ChipLabelResolvers {
  industryName: (id: string) => string;
  jobRoleTypeName: (id: string) => string;
  specializationName: (id: string) => string;
  locationName: (id: string) => string;
}

export function useCandidateSearch(resolvers: ChipLabelResolvers) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Lazy initializer: read once from whatever's already in the URL (a
  // bookmarked/shared search, or a refresh) — `useSearchParams` is stable
  // and available synchronously on the client, so this doesn't need an
  // effect or risk a hydration mismatch.
  const [filters, setFiltersState] = React.useState<CandidateFilterState>(() =>
    filtersFromSearchParams(searchParams),
  );

  // One-directional: filter state is the source of truth and pushes to the
  // URL on every change (replace, not push — a filter tweak isn't a distinct
  // history stop). Deliberately doesn't listen back for browser
  // back/forward, which would need its own re-entrancy guard against this
  // same effect; the URL here exists so a search can be bookmarked or
  // shared, not to make every click undoable via Back.
  React.useEffect(() => {
    const query = filtersToSearchParams(filters).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters, pathname, router]);

  const set = React.useCallback(<K extends keyof CandidateFilterState>(key: K, value: CandidateFilterState[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const removeFromArray = React.useCallback(
    <K extends keyof CandidateFilterState>(key: K, value: string) => {
      setFiltersState((prev) => ({
        ...prev,
        [key]: (prev[key] as unknown as string[]).filter((v) => v !== value),
      }));
    },
    [],
  );

  const clearScalar = React.useCallback((key: 'q' | 'lastContactedFrom' | 'lastContactedTo') => {
    setFiltersState((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  /** Merges a filter patch (from the smart search bar, a preset chip, etc.) on top of the current state. */
  const applyFilters = React.useCallback((patch: Partial<CandidateFilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearAll = React.useCallback(() => setFiltersState(EMPTY_STATE), []);

  const chips = React.useMemo<FilterChip[]>(() => {
    const list: FilterChip[] = [];
    filters.jobRoleTypeIds.forEach((id) =>
      list.push({
        key: `jobRoleType:${id}`,
        label: `Role Type: ${resolvers.jobRoleTypeName(id)}`,
        remove: () => removeFromArray('jobRoleTypeIds', id),
      }),
    );
    filters.statuses.forEach((status) =>
      list.push({
        key: `status:${status}`,
        label: `Status: ${candidateStatusLabels[status]}`,
        variant: candidateStatusVariants[status],
        remove: () => removeFromArray('statuses', status),
      }),
    );
    filters.locationIds.forEach((id) =>
      list.push({ key: `location:${id}`, label: `Location: ${resolvers.locationName(id)}`, remove: () => removeFromArray('locationIds', id) }),
    );
    filters.industryIds.forEach((id) =>
      list.push({ key: `industry:${id}`, label: `Industry: ${resolvers.industryName(id)}`, remove: () => removeFromArray('industryIds', id) }),
    );
    filters.specializationIds.forEach((id) =>
      list.push({
        key: `specialization:${id}`,
        label: `Specialization: ${resolvers.specializationName(id)}`,
        remove: () => removeFromArray('specializationIds', id),
      }),
    );
    filters.submissionStatuses.forEach((status) =>
      list.push({
        key: `submission:${status}`,
        label: `Submission: ${submissionStatusLabels[status]}`,
        remove: () => removeFromArray('submissionStatuses', status),
      }),
    );
    filters.placementStatuses.forEach((status) =>
      list.push({
        key: `placement:${status}`,
        label: `Placement: ${placementStatusLabels[status]}`,
        remove: () => removeFromArray('placementStatuses', status),
      }),
    );
    if (filters.lastContactedFrom || filters.lastContactedTo) {
      list.push({
        key: 'lastContacted',
        label: `Last Contacted: ${filters.lastContactedFrom ?? '…'} – ${filters.lastContactedTo ?? '…'}`,
        remove: () => setFiltersState((prev) => ({ ...prev, lastContactedFrom: undefined, lastContactedTo: undefined })),
      });
    }
    if (filters.q) list.push({ key: 'q', label: `Search: ${filters.q}`, remove: () => clearScalar('q') });
    return list;
  }, [filters, resolvers, removeFromArray, clearScalar]);

  const hasActiveFilters = chips.length > 0;

  const queryParams = React.useMemo<GetCandidatesParams>(
    () => ({
      q: filters.q || undefined,
      statuses: filters.statuses.length ? filters.statuses : undefined,
      industryIds: filters.industryIds.length ? filters.industryIds : undefined,
      jobRoleTypeIds: filters.jobRoleTypeIds.length ? filters.jobRoleTypeIds : undefined,
      specializationIds: filters.specializationIds.length ? filters.specializationIds : undefined,
      submissionStatuses: filters.submissionStatuses.length ? filters.submissionStatuses : undefined,
      placementStatuses: filters.placementStatuses.length ? filters.placementStatuses : undefined,
      locationIds: filters.locationIds.length ? filters.locationIds : undefined,
      lastContactedFrom: filters.lastContactedFrom || undefined,
      lastContactedTo: filters.lastContactedTo || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
    [filters],
  );

  return { filters, set, applyFilters, clearAll, chips, hasActiveFilters, queryParams };
}
