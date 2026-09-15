'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Users, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ClientFilterButton } from '@/components/ClientFilterButton';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { LocationFilterButton } from '@/components/LocationMultiSelect';
import { useGateSnapshot, usePersistGateSnapshot } from '@/hooks/use-gate-snapshot';
import { useSeedFiltersFromScope } from '@/hooks/use-seed-filters-from-scope';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import { useGetStakeholderRoleTypes } from '@/lib/api/generated/stakeholder-role-types/stakeholder-role-types';
import { StakeholdersTable } from './StakeholdersTable';
import { sortByOptions, type SortByValue, type StakeholderAppliedFilters } from './schema';

const RESET_FADE_MS = 200;

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

interface StakeholdersGateSnapshot {
  countryIds: string[];
  cityIds: string[];
  industryIds: string[];
  clientIds: string[];
  roleTypeIds: string[];
  sortByValue: SortByValue | '';
  countryNames: Record<string, string>;
  cityNames: Record<string, string>;
  clientNames: Record<string, string>;
  appliedFilters: StakeholderAppliedFilters | null;
}

const GATE_SNAPSHOT_KEY = 'stakeholders-gate-snapshot';

export function StakeholdersSearchGate({
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
  const restoring = searchParams.get('restore') === '1';
  const snapshot = useGateSnapshot<StakeholdersGateSnapshot>(GATE_SNAPSHOT_KEY, restoring);

  const [countryIds, setCountryIds] = React.useState<string[]>(snapshot?.countryIds ?? []);
  const [cityIds, setCityIds] = React.useState<string[]>(snapshot?.cityIds ?? []);
  const [industryIds, setIndustryIds] = React.useState<string[]>(snapshot?.industryIds ?? []);
  const [clientIds, setClientIds] = React.useState<string[]>(snapshot?.clientIds ?? []);
  const [roleTypeIds, setRoleTypeIds] = React.useState<string[]>(snapshot?.roleTypeIds ?? []);
  const [sortByValue, setSortByValue] = React.useState<SortByValue | ''>(snapshot?.sortByValue ?? '');

  const [countryNames, setCountryNames] = React.useState<Record<string, string>>(
    snapshot?.countryNames ?? {},
  );
  const registerCountryName = React.useCallback(
    (id: string, name: string) => setCountryNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [cityNames, setCityNames] = React.useState<Record<string, string>>(snapshot?.cityNames ?? {});
  const registerCityName = React.useCallback(
    (id: string, name: string) => setCityNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );
  const [clientNames, setClientNames] = React.useState<Record<string, string>>(
    snapshot?.clientNames ?? {},
  );
  const registerClientName = React.useCallback(
    (id: string, name: string) => setClientNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name })),
    [],
  );

  const { data: industriesData } = useGetIndustries();
  const industries = industriesData?.status === 200 ? industriesData.data : [];
  const industryOptions = React.useMemo(
    () => industries.map((i) => ({ value: i.id, label: i.name })),
    [industries],
  );

  const { data: roleTypeData } = useGetStakeholderRoleTypes({ take: 200 });
  const roleTypeRows = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const roleTypeOptions = React.useMemo(
    () => roleTypeRows.map((r) => ({ value: r.id, label: r.name })),
    [roleTypeRows],
  );

  const [appliedFilters, setAppliedFilters] = React.useState<StakeholderAppliedFilters | null>(
    snapshot?.appliedFilters ?? null,
  );
  // Command palette `/stakeholders?new=1` — mount the table (empty filters if
  // needed) and ask it to focus the new row once, since the table only exists
  // after Search.
  const [focusNewRow, setFocusNewRow] = React.useState(false);

  React.useEffect(() => {
    if (searchParams.get('new') === '1') {
      setAppliedFilters((prev) => prev ?? {});
      setFocusNewRow(true);
      router.replace('/stakeholders');
    }
  }, [searchParams, router]);

  React.useEffect(() => {
    if (restoring) router.replace('/stakeholders');
  }, [restoring, router]);

  usePersistGateSnapshot(GATE_SNAPSHOT_KEY, {
    countryIds,
    cityIds,
    industryIds,
    clientIds,
    roleTypeIds,
    sortByValue,
    countryNames,
    cityNames,
    clientNames,
    appliedFilters,
  } satisfies StakeholdersGateSnapshot);

  useSeedFiltersFromScope({
    setIndustryIds,
    setSpecializationIds: () => {},
    registerSpecializationName: () => {},
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
    clientIds.length > 0 ||
    roleTypeIds.length > 0 ||
    sortByValue !== '';

  function handleSearch() {
    const locationIds = [...countryIds, ...cityIds];
    const sort = sortByOptions.find((o) => o.value === sortByValue);
    setAppliedFilters({
      locationIds: locationIds.length ? locationIds : undefined,
      industryIds: industryIds.length ? industryIds : undefined,
      clientIds: clientIds.length ? clientIds : undefined,
      roleTypeIds: roleTypeIds.length ? roleTypeIds : undefined,
      sortBy: sort?.sortBy,
      sortOrder: sort?.sortOrder,
    });
  }

  const [isResetting, setIsResetting] = React.useState(false);
  function handleReset() {
    if (isResetting) return;
    setIsResetting(true);
    window.setTimeout(() => {
      setCountryIds([]);
      setCityIds([]);
      setIndustryIds([]);
      setClientIds([]);
      setRoleTypeIds([]);
      setSortByValue('');
      setAppliedFilters(null);
      setFocusNewRow(false);
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
          <FilterField label="Company">
            <ClientFilterButton
              selected={clientIds}
              onChange={setClientIds}
              compact={false}
              placeholder="All companies"
              title="Company"
              labelFor={(id) => clientNames[id] ?? id}
              onResolve={registerClientName}
            />
          </FilterField>
          <FilterField label="Role Type">
            <DataGridFacetedFilter
              title="Role Type"
              placeholder="All role types"
              options={roleTypeOptions}
              selected={roleTypeIds}
              onChange={setRoleTypeIds}
              triggerClassName="w-full justify-between"
            />
          </FilterField>
          <FilterField label="Sorted By">
            <DataGridFacetedFilter
              title="Sorted By"
              placeholder="Default order"
              options={sortByOptions}
              single
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
          <StakeholdersTable
            filters={appliedFilters}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
            focusNewRow={focusNewRow}
            onFocusedNewRow={() => setFocusNewRow(false)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-24 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">No stakeholders displayed yet</p>
              <p className="text-sm text-muted-foreground">
                Select your preferences above to view matching stakeholders.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
