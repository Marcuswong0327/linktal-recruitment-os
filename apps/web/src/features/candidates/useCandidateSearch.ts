'use client';

import * as React from 'react';
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

/** The filter/search state a candidate search shares between the top search-gate and the results grid. */
export interface CandidateFilterState {
  q?: string;
  statuses: GetCandidatesStatusesItem[];
  industryIds: string[];
  roleTypeIds: string[];
  specializationIds: string[];
  skills: string[];
  consultantIds: string[];
  submissionStatuses: GetCandidatesSubmissionStatusesItem[];
  placementStatuses: GetCandidatesPlacementStatusesItem[];
  /** Matches either city or country server-side — "Location" is one filter over both columns. */
  location?: string;
  lastContactedFrom?: string;
  lastContactedTo?: string;
  sortBy?: GetCandidatesSortBy;
  sortOrder?: GetCandidatesSortOrder;
}

const EMPTY_STATE: CandidateFilterState = {
  statuses: [],
  industryIds: [],
  roleTypeIds: [],
  specializationIds: [],
  skills: [],
  consultantIds: [],
  submissionStatuses: [],
  placementStatuses: [],
};

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
  roleTypeName: (id: string) => string;
  specializationName: (id: string) => string;
  consultantName: (id: string) => string;
}

export function useCandidateSearch(resolvers: ChipLabelResolvers) {
  const [filters, setFilters] = React.useState<CandidateFilterState>(EMPTY_STATE);

  const set = React.useCallback(<K extends keyof CandidateFilterState>(key: K, value: CandidateFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const removeFromArray = React.useCallback(
    <K extends keyof CandidateFilterState>(key: K, value: string) => {
      setFilters((prev) => ({
        ...prev,
        [key]: (prev[key] as unknown as string[]).filter((v) => v !== value),
      }));
    },
    [],
  );

  const clearScalar = React.useCallback((key: 'q' | 'location' | 'lastContactedFrom' | 'lastContactedTo') => {
    setFilters((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  /** Merges a parsed/applied filter patch (from the query-language parser or a saved search) on top of the current state. */
  const applyFilters = React.useCallback((patch: Partial<CandidateFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearAll = React.useCallback(() => setFilters(EMPTY_STATE), []);

  const chips = React.useMemo<FilterChip[]>(() => {
    const list: FilterChip[] = [];
    filters.industryIds.forEach((id) =>
      list.push({ key: `industry:${id}`, label: `Industry: ${resolvers.industryName(id)}`, remove: () => removeFromArray('industryIds', id) }),
    );
    filters.roleTypeIds.forEach((id) =>
      list.push({ key: `roleType:${id}`, label: `Role Type: ${resolvers.roleTypeName(id)}`, remove: () => removeFromArray('roleTypeIds', id) }),
    );
    filters.specializationIds.forEach((id) =>
      list.push({
        key: `specialization:${id}`,
        label: `Specialization: ${resolvers.specializationName(id)}`,
        remove: () => removeFromArray('specializationIds', id),
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
    filters.consultantIds.forEach((id) =>
      list.push({ key: `consultant:${id}`, label: `Consultant: ${resolvers.consultantName(id)}`, remove: () => removeFromArray('consultantIds', id) }),
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
    filters.skills.forEach((skill) =>
      list.push({ key: `skill:${skill}`, label: `Skill: ${skill}`, remove: () => removeFromArray('skills', skill) }),
    );
    if (filters.location) {
      list.push({ key: 'location', label: `Location: ${filters.location}`, remove: () => clearScalar('location') });
    }
    if (filters.lastContactedFrom || filters.lastContactedTo) {
      list.push({
        key: 'lastContacted',
        label: `Last Contacted: ${filters.lastContactedFrom ?? '…'} – ${filters.lastContactedTo ?? '…'}`,
        remove: () => setFilters((prev) => ({ ...prev, lastContactedFrom: undefined, lastContactedTo: undefined })),
      });
    }
    if (filters.q) list.push({ key: 'q', label: `Search: ${filters.q}`, remove: () => clearScalar('q') });
    return list;
  }, [filters, resolvers, removeFromArray, clearScalar]);

  const hasActiveQuery = chips.length > 0;

  const queryParams = React.useMemo<GetCandidatesParams>(
    () => ({
      q: filters.q || undefined,
      statuses: filters.statuses.length ? filters.statuses : undefined,
      industryIds: filters.industryIds.length ? filters.industryIds : undefined,
      roleTypeIds: filters.roleTypeIds.length ? filters.roleTypeIds : undefined,
      specializationIds: filters.specializationIds.length ? filters.specializationIds : undefined,
      skills: filters.skills.length ? filters.skills : undefined,
      consultantIds: filters.consultantIds.length ? filters.consultantIds : undefined,
      submissionStatuses: filters.submissionStatuses.length ? filters.submissionStatuses : undefined,
      placementStatuses: filters.placementStatuses.length ? filters.placementStatuses : undefined,
      location: filters.location || undefined,
      lastContactedFrom: filters.lastContactedFrom || undefined,
      lastContactedTo: filters.lastContactedTo || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
    [filters],
  );

  return { filters, set, applyFilters, clearAll, chips, hasActiveQuery, queryParams };
}
