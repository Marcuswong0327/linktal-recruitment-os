'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { useGetJobTitles } from '@/lib/api/generated/job-titles/job-titles';
import { useGetJobRoleTypes } from '@/lib/api/generated/job-role-types/job-role-types';
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
 */
function useCatalogOptions(
  useQuery: typeof useGetJobTitles | typeof useGetJobRoleTypes,
): CatalogOptions {
  const [q, setQ] = React.useState('');
  const { data, isFetching } = useQuery(
    { q: q || undefined, take: PAGE_SIZE },
    { query: { placeholderData: keepPreviousData } },
  );
  const options = React.useMemo(
    () => (data?.status === 200 ? data.data.map(({ id, name }) => ({ id, name })) : []),
    [data],
  );
  return { options, onQueryChange: setQ, isFetching };
}

/** Job Titles — the company's own words for a role (`JobTitle`). ~2,350 rows. */
export function useJobTitleOptions(): CatalogOptions {
  return useCatalogOptions(useGetJobTitles);
}

/** Job Role Types — the consultant's classification (`JobRoleType`). ~267 rows. */
export function useJobRoleTypeOptions(): CatalogOptions {
  return useCatalogOptions(useGetJobRoleTypes);
}
