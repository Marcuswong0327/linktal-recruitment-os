'use client';

import * as React from 'react';
import { Search, UserSearch, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/app-shell/PageLayout';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import { useGetSpecializations } from '@/lib/api/generated/specializations/specializations';
import { useGetCandidateRoleTypes } from '@/lib/api/generated/candidate-role-types/candidate-role-types';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { CandidatesTable } from './CandidatesTable';
import { SavedSearchesMenu } from './SavedSearchesMenu';
import { parseQueryLanguage, QUERY_LANGUAGE_HELP } from './parseQueryLanguage';
import { type CandidateFilterState, useCandidateSearch } from './useCandidateSearch';

type SearchMode = 'quick' | 'advanced';

/** Unions array fields, overwrites scalar ones — how a parsed query-language patch layers onto whatever's already active (typing more criteria adds to the search, it doesn't replace it). */
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

export function CandidateSearchGate({ canCreate, canDelete }: { canCreate: boolean; canDelete: boolean }) {
  const { data: industriesData } = useGetIndustries();
  const industries = industriesData?.status === 200 ? industriesData.data : [];
  const { data: roleTypesData } = useGetCandidateRoleTypes();
  const roleTypes = roleTypesData?.status === 200 ? roleTypesData.data : [];
  const { data: specializationsData } = useGetSpecializations();
  const specializations = specializationsData?.status === 200 ? specializationsData.data : [];
  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  const resolvers = React.useMemo(
    () => ({
      industryName: (id: string) => industries.find((i) => i.id === id)?.name ?? id,
      roleTypeName: (id: string) => roleTypes.find((r) => r.id === id)?.name ?? id,
      specializationName: (id: string) => specializations.find((s) => s.id === id)?.name ?? id,
      consultantName: (id: string) => consultants.find((c) => c.id === id)?.fullName ?? id,
    }),
    [industries, roleTypes, specializations, consultants],
  );

  // parseQueryLanguage's lookups are name-keyed ({id, name}) — consultants
  // only carry `fullName`, so map it to the same shape as the others.
  const consultantOptions = React.useMemo(
    () => consultants.map((c) => ({ id: c.id, name: c.fullName })),
    [consultants],
  );

  const search = useCandidateSearch(resolvers);
  const [mode, setMode] = React.useState<SearchMode>('quick');
  const [searchText, setSearchText] = React.useState('');

  function handleSearchSubmit() {
    const trimmed = searchText.trim();
    if (!trimmed) return;

    if (mode === 'quick') {
      search.applyFilters({ q: [search.filters.q, trimmed].filter(Boolean).join(' ') });
    } else {
      const { patch, unmatched } = parseQueryLanguage(trimmed, {
        industries,
        roleTypes,
        specializations,
        consultants: consultantOptions,
      });
      const merged = mergeAdditive(search.filters, patch);
      if (unmatched.length > 0) {
        merged.q = [search.filters.q, unmatched.join(' ')].filter(Boolean).join(' ');
      }
      search.applyFilters(merged);
    }
    setSearchText('');
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Search Candidates"
        description="Start by searching or filtering to find the right candidates."
        actions={
          <SavedSearchesMenu
            currentFilters={search.filters}
            hasActiveQuery={search.hasActiveQuery}
            onApply={(filters) => search.applyFilters(filters)}
          />
        }
      />

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">1. Industry</span>
          <DataGridFacetedFilter
            title="Select industry"
            options={industries.map((i) => ({ value: i.id, label: i.name }))}
            selected={search.filters.industryIds}
            onChange={(values) => search.set('industryIds', values)}
            triggerClassName="w-full justify-between"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">2. Role Type</span>
          <DataGridFacetedFilter
            title="Select role type"
            options={roleTypes.map((r) => ({ value: r.id, label: r.name }))}
            selected={search.filters.roleTypeIds}
            onChange={(values) => search.set('roleTypeIds', values)}
            triggerClassName="w-full justify-between"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">3. Specialization</span>
          <DataGridFacetedFilter
            title="Select specialization"
            options={specializations.map((s) => ({ value: s.id, label: s.name }))}
            selected={search.filters.specializationIds}
            onChange={(values) => search.set('specializationIds', values)}
            triggerClassName="w-full justify-between"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-4 border-b border-border">
          {(['quick', 'advanced'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                mode === m ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'quick' ? 'Free Text Search' : 'Advanced (Key-Value Search)'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchSubmit();
              }}
              placeholder={
                mode === 'quick'
                  ? 'Search by name, title, skills, company, location, email, phone…'
                  : 'Status: Warm, Location: Sydney'
              }
              className="pl-8"
            />
          </div>
          <Button onClick={handleSearchSubmit} disabled={!searchText.trim()}>
            Search
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === 'quick' ? 'Example: John Lee, Senior Developer, AWS' : QUERY_LANGUAGE_HELP}
        </p>
      </div>

      {search.chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
          <span className="text-sm font-medium">Active Filters</span>
          {search.chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 py-1">
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

      {search.hasActiveQuery ? (
        <CandidatesTable canCreate={canCreate} canDelete={canDelete} search={search} consultants={consultants} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <UserSearch className="size-12 text-muted-foreground/50" />
          <h3 className="font-heading text-lg font-semibold">Search to find candidates</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Use the filters and search above to find candidates that match your requirements.
          </p>
        </div>
      )}
    </div>
  );
}
