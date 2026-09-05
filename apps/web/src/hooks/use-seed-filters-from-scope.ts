'use client';

import * as React from 'react';
import { useQueries } from '@tanstack/react-query';

import { useGetMe } from '@/lib/api/generated/consultants/consultants';
import { getGetLocationQueryOptions } from '@/lib/api/generated/locations/locations';

interface SeedFiltersFromScopeOptions {
  setIndustryIds: (ids: string[]) => void;
  setSpecializationIds: (ids: string[]) => void;
  registerSpecializationName: (id: string, name: string) => void;
  setCountryIds: (ids: string[]) => void;
  setCityIds: (ids: string[]) => void;
  registerCountryName: (id: string, name: string) => void;
  registerCityName: (id: string, name: string) => void;
  /** Leave the filters alone — the caller is restoring a saved view. */
  skip?: boolean;
}

/**
 * Defaults a search/filter bar's draft selections to the logged-in
 * consultant's own scope grants (Industry/Specialization/Location — see
 * docs/scope-explained.md), so their own patch is one click away instead of
 * built from scratch. No-op for admin/manager/etc., whose grant arrays are
 * normally empty (scoping only restricts the `consultant` role). Shared by
 * the Companies/Candidates/Job-research search gates — all three need it.
 *
 * Location grants carry no level of their own (Consultant.locations is a
 * flat, mixed-rung list) — the Country/City dropdowns are level-scoped, so
 * each grant needs a lookup to know which one it belongs in. Routed through
 * `useQueries` (real TanStack Query queries, not raw fetches) specifically
 * so a transient failure retries via the client's default retry instead of
 * silently and permanently leaving the filter unseeded — the previous
 * `Promise.all(getLocation(id).catch(() => null))` gave up for good on the
 * first failed lookup, which is what caused the bar to intermittently show
 * "All countries" instead of the consultant's real scope on page load.
 * Every grant is representable in this two-dropdown bar now that the tree
 * has exactly two rungs (Country / City Coverage).
 */
export function useSeedFiltersFromScope({
  setIndustryIds,
  setSpecializationIds,
  registerSpecializationName,
  setCountryIds,
  setCityIds,
  registerCountryName,
  registerCityName,
  skip = false,
}: SeedFiltersFromScopeOptions) {
  const { data: meData } = useGetMe();
  const me = meData?.status === 200 ? meData.data : undefined;
  const scopeLocationIds = me?.locationIds ?? [];

  const locationQueries = useQueries({
    queries: scopeLocationIds.map((id) => getGetLocationQueryOptions(id)),
  });
  const locationsSettled =
    scopeLocationIds.length === 0 || locationQueries.every((q) => q.isSuccess || q.isError);

  const seededRef = React.useRef(false);
  React.useEffect(() => {
    // `skip` is for a gate restoring a previous view: the defaults would land
    // a beat after the restore (they wait on `me`) and silently overwrite it.
    if (skip) {
      seededRef.current = true;
      return;
    }
    if (!me || seededRef.current || !locationsSettled) return;

    const scopeIndustryIds = me.industryIds ?? [];
    const scopeSpecializationIds = me.specializationIds ?? [];
    const scopeSpecializationNames = me.specializations ?? [];
    const scopeLocationNames = me.locations ?? [];
    if (scopeIndustryIds.length === 0 && scopeSpecializationIds.length === 0 && scopeLocationIds.length === 0) {
      seededRef.current = true;
      return;
    }

    seededRef.current = true;
    setIndustryIds(scopeIndustryIds);
    setSpecializationIds(scopeSpecializationIds);
    scopeSpecializationIds.forEach((id, i) => {
      if (scopeSpecializationNames[i]) registerSpecializationName(id, scopeSpecializationNames[i]);
    });

    const nextCountryIds: string[] = [];
    const nextCityIds: string[] = [];
    locationQueries.forEach((q, i) => {
      const id = scopeLocationIds[i];
      const location = q.data?.status === 200 ? q.data.data : undefined;
      const name = location?.name ?? scopeLocationNames[i];
      if (location?.level === 'COUNTRY') {
        nextCountryIds.push(id);
        if (name) registerCountryName(id, name);
      } else if (location?.level === 'CITY_COVERAGE') {
        nextCityIds.push(id);
        if (name) registerCityName(id, name);
      }
    });
    setCountryIds(nextCountryIds);
    setCityIds(nextCityIds);
    // locationQueries is intentionally omitted — its identity changes every
    // render; `locationsSettled` is the derived signal this effect actually
    // needs to react to.
  }, [
    me,
    locationsSettled,
    setIndustryIds,
    setSpecializationIds,
    registerSpecializationName,
    setCountryIds,
    setCityIds,
    registerCountryName,
    registerCityName,
  ]);
}
