'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { GridCellCombobox } from '@/components/GridCellCombobox';
import { useGetLocations } from '@/lib/api/generated/locations/locations';
import type { LocationEntity } from '@/lib/api/generated/types';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export interface LocationChoice {
  id: string;
  name: string;
}

/**
 * Debounced server search over the Location catalog, shared by the single- and
 * multi-select location cells.
 *
 * Location can't be filtered from a preloaded roster like the small catalogs
 * can: it's GeoNames-scale, so each settled keystroke asks the API instead —
 * the same shape `LocationCombobox` uses. Nothing here is creatable:
 * `location:create` is admin-only (see the two hierarchies in CLAUDE.md), so
 * an "Add …" option would only ever produce a 403.
 */
export function useLocationSearch() {
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searchEnabled = debouncedQuery.length >= MIN_QUERY_LENGTH;
  const { data } = useGetLocations(
    { q: debouncedQuery, take: 20 },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  const results: LocationEntity[] = searchEnabled && data?.status === 200 ? data.data : [];

  return {
    setQuery,
    results,
    emptyMessage: searchEnabled ? 'No locations found.' : 'Type at least 2 characters to search.',
  };
}

interface GridCellLocationComboboxProps {
  id?: string;
  /** Selected location's id — '' for none. */
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** The single-location cell for a DataGrid new-row, search-as-you-type. */
export function GridCellLocationCombobox({
  id,
  value,
  onValueChange,
  disabled,
  placeholder,
}: GridCellLocationComboboxProps) {
  const { setQuery, results, emptyMessage } = useLocationSearch();

  // Carries the chosen row forward even after the search that produced it has
  // been replaced — `GridCellCombobox` resolves the held id to a display name
  // through this list, and a new query would otherwise leave the cell unable
  // to name its own selection.
  const [picked, setPicked] = React.useState<LocationChoice | null>(null);
  const options = React.useMemo(() => {
    const rows = results.map((r) => ({ id: r.id, name: r.name }));
    return picked && !rows.some((r) => r.id === picked.id) ? [...rows, picked] : rows;
  }, [results, picked]);

  return (
    <GridCellCombobox
      id={id}
      value={value}
      onValueChange={(nextId) => {
        setPicked(options.find((o) => o.id === nextId) ?? null);
        onValueChange(nextId);
      }}
      options={options}
      serverSearched
      onQueryChange={setQuery}
      emptyMessage={emptyMessage}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

interface GridCellLocationMultiSelectProps {
  id?: string;
  selected: LocationChoice[];
  onChange: (next: LocationChoice[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The multi-location cell for a DataGrid new-row (a stakeholder's coverage, a
 * client's markets), type-first.
 *
 * The app's general-purpose `LocationMultiSelect` is a *button* that opens a
 * popup containing a search box, which is right for a form but wrong here:
 * tabbing across the new row would land on a button that ignores typing,
 * while every neighbouring cell accepts it. So this is the same chips-plus-box
 * shape as `GridCellContactInput` — tab in, type, pick, and the box clears
 * itself ready for the next one.
 */
export function GridCellLocationMultiSelect({
  id,
  selected,
  onChange,
  disabled,
  placeholder,
}: GridCellLocationMultiSelectProps) {
  const { setQuery, results, emptyMessage } = useLocationSearch();

  // Already-chosen rows are dropped from the list: re-picking one would be a
  // no-op, and leaving them in makes the short result list mostly noise.
  const options = React.useMemo(
    () =>
      results
        .filter((r) => !selected.some((s) => s.id === r.id))
        .map((r) => ({ id: r.id, name: r.name })),
    [results, selected],
  );

  return (
    <div className="flex flex-col gap-1 py-0.5">
      {selected.map((location) => (
        <span
          key={location.id}
          className="flex items-center gap-1.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-xs"
        >
          <span className="min-w-0 flex-1 truncate">{location.name}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(selected.filter((s) => s.id !== location.id))}
            aria-label={`Remove ${location.name}`}
            className="shrink-0 rounded-full text-muted-foreground opacity-60 outline-none hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <GridCellCombobox
        id={id}
        // Never holds a value of its own — a pick becomes a chip above.
        value=""
        onValueChange={(nextId) => {
          const picked = options.find((o) => o.id === nextId);
          if (picked) onChange([...selected, picked]);
        }}
        options={options}
        serverSearched
        clearOnSelect
        onQueryChange={setQuery}
        emptyMessage={emptyMessage}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
