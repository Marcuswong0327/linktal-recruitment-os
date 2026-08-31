'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { GridCellCombobox } from '@/components/GridCellCombobox';
import { useGetSpecializations } from '@/lib/api/generated/specializations/specializations';
import type { SpecializationEntity } from '@/lib/api/generated/types';

const DEBOUNCE_MS = 250;
const TAKE = 20;

export interface PickedSpecialization {
  id: string;
  name: string;
  industryId: string;
}

interface GridCellSpecializationComboboxProps {
  id?: string;
  /** Selected specialization's id — '' for none. */
  value: string;
  onValueChange: (picked: PickedSpecialization | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The Specialization cell for a DataGrid new-row, search-as-you-type.
 *
 * Server-searched rather than filtered from a preloaded roster:
 * `GET /specializations` caps `take` at 200 and is explicitly built for
 * "a search-driven picker that asks for a page matching what's been typed"
 * (see QuerySpecializationsDto), so a wholesale fetch both risks a 400 and
 * silently omits anything past the cap.
 *
 * Reports the whole row rather than just an id because callers need its
 * `industryId` — Industry ▸ Specialization, and `Client.industryId` is
 * required while the Companies grid has no Industry column of its own.
 *
 * Not creatable: `specialization:create` is admin/manager-only.
 */
export function GridCellSpecializationCombobox({
  id,
  value,
  onValueChange,
  disabled,
  placeholder,
}: GridCellSpecializationComboboxProps) {
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Unlike locations, an empty query is still worth asking for — the catalog
  // is small enough that the first page is a useful "here's what exists"
  // list before anything is typed.
  const { data } = useGetSpecializations(
    { q: debouncedQuery || undefined, take: TAKE },
    { query: { placeholderData: keepPreviousData } },
  );
  const results: SpecializationEntity[] = data?.status === 200 ? data.data : [];

  // Keeps the chosen row nameable after the search that produced it has been
  // replaced — see the same pattern in GridCellLocationCombobox.
  const [picked, setPicked] = React.useState<PickedSpecialization | null>(null);
  const options = React.useMemo(() => {
    const rows = results.map((r) => ({ id: r.id, name: r.name, industryId: r.industryId }));
    return picked && !rows.some((r) => r.id === picked.id) ? [...rows, picked] : rows;
  }, [results, picked]);

  return (
    <GridCellCombobox
      id={id}
      value={value}
      onValueChange={(nextId) => {
        const next = options.find((o) => o.id === nextId) ?? null;
        setPicked(next);
        onValueChange(next);
      }}
      options={options}
      serverSearched
      onQueryChange={setQuery}
      emptyMessage="No specializations found."
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
