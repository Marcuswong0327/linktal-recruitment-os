'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { GridCellCombobox } from '@/components/GridCellCombobox';
import { useGetLocations } from '@/lib/api/generated/locations/locations';
import type { LocationEntity } from '@/lib/api/generated/types';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface GridCellLocationComboboxProps {
  id?: string;
  /** Selected location's id — '' for none. */
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The Location cell for a DataGrid new-row. Same search-as-you-type behaviour
 * as `LocationCombobox`, in the type-first cell shape (see
 * `GridCellCombobox`).
 *
 * Location can't use the plain `GridCellCombobox`: the catalog is
 * GeoNames-scale, so it's searched server-side per keystroke rather than
 * filtered from a roster held in the client. Nothing is creatable here —
 * `location:create` is admin-only (see the two hierarchies in CLAUDE.md), so
 * offering "Add …" would only ever produce a 403.
 */
export function GridCellLocationCombobox({
  id,
  value,
  onValueChange,
  disabled,
  placeholder,
}: GridCellLocationComboboxProps) {
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

  // Carries the chosen row forward even after the search that produced it has
  // been replaced — `GridCellCombobox` resolves the held id to a display name
  // through this list, and a new query would otherwise leave the cell unable
  // to name its own selection.
  const [picked, setPicked] = React.useState<{ id: string; name: string } | null>(null);
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
      emptyMessage={
        searchEnabled ? 'No locations found.' : 'Type at least 2 characters to search.'
      }
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
