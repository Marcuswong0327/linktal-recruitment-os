'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { GRID_CELL_MIN_QUERY_LENGTH } from '@/components/GridCellCombobox';
import { useGetJobTitles } from '@/lib/api/generated/job-titles/job-titles';
import { useGetJobRoleTypes } from '@/lib/api/generated/job-role-types/job-role-types';
import { useGetSpecializations } from '@/lib/api/generated/specializations/specializations';
import type { CreatableComboboxOption } from '@/components/CreatableCombobox';

/** The API caps `take` at 200 per catalog request, so a page is all we can ask for. */
const PAGE_SIZE = 50;

export interface CatalogOptions {
  options: CreatableComboboxOption[];
  onQueryChange: (q: string) => void;
  isFetching: boolean;
}

/**
 * Server-searched options for a `CreatableCombobox` over a growable catalog.
 *
 * These catalogs outgrew the "fetch a page and filter it in the browser"
 * approach: there are ~2,350 active job titles against a `take` the API caps
 * at 200, so a pre-fetched page held only the alphabetical first slice
 * (everything past "Chair") and the rest was unreachable — the picker would
 * offer "Add <name>" for titles that already existed, quietly fragmenting the
 * catalog into duplicates. Searching server-side is what makes the whole
 * catalog reachable; it also inherits the endpoint's prefix-first ranking.
 *
 * Fetches only after `GRID_CELL_MIN_QUERY_LENGTH` characters — same floor as
 * City Coverage, so a focused empty cell never pulls (or dumps) a first page.
 */
function useCatalogOptions(
  useQuery: typeof useGetJobTitles | typeof useGetJobRoleTypes,
): CatalogOptions {
  const [q, setQ] = React.useState('');
  const trimmed = q.trim();
  const searchEnabled = trimmed.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const { data, isFetching } = useQuery(
    { q: trimmed, take: PAGE_SIZE },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  const options = React.useMemo(
    () =>
      searchEnabled && data?.status === 200
        ? data.data.map(({ id, name }) => ({ id, name }))
        : [],
    [data, searchEnabled],
  );
  return { options, onQueryChange: setQ, isFetching: searchEnabled && isFetching };
}

/** Job Titles — the company's own words for a role (`JobTitle`). ~2,350 rows. */
export function useJobTitleOptions(): CatalogOptions {
  return useCatalogOptions(useGetJobTitles);
}

/** Job Role Types — the consultant's classification (`JobRoleType`). ~267 rows. */
export function useJobRoleTypeOptions(): CatalogOptions {
  return useCatalogOptions(useGetJobRoleTypes);
}

/**
 * Specializations under one industry — the Companies grid's Specialization
 * cell. Separate from `useCatalogOptions` because this catalog is a child rung
 * (`Industry ▸ Specialization`) and the picker must never offer a value from
 * another industry: `Client.industryId` is required, so a specialization
 * parented elsewhere would leave the row internally inconsistent and confuse
 * the scope resolver's industry arm (docs/scope-explained.md §3).
 *
 * Passing no `industryId` yields no options rather than the whole catalog —
 * "not chosen yet" must not read as "anything goes".
 */
export function useSpecializationOptions(industryId: string | undefined): CatalogOptions {
  const [q, setQ] = React.useState('');
  const trimmed = q.trim();
  const searchEnabled = Boolean(industryId) && trimmed.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const { data, isFetching } = useGetSpecializations(
    { q: trimmed, take: PAGE_SIZE, industryIds: industryId ? [industryId] : undefined },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  const options = React.useMemo(
    () =>
      searchEnabled && data?.status === 200
        ? data.data.map(({ id, name }) => ({ id, name }))
        : [],
    [data, searchEnabled],
  );
  return { options, onQueryChange: setQ, isFetching: searchEnabled && isFetching };
}
