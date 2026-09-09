'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import {
  GridCellCombobox,
  GRID_CELL_MIN_QUERY_LENGTH,
} from '@/components/GridCellCombobox';
import { useGetClients } from '@/lib/api/generated/clients/clients';

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 20;

interface GridCellClientComboboxProps {
  id?: string;
  /** Selected client's id — '' for none. */
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The Company cell for a DataGrid new-row, search-as-you-type.
 *
 * Server-searched rather than filtered from a preloaded roster.
 * `GET /clients` caps `pageSize` at 100 (QueryClientsDto) while the client
 * roster runs into the thousands, so fetching one capped page and filtering
 * it in the browser silently hides most of the catalog — including, reliably,
 * any company created recently enough to sort outside that first page. It
 * takes the `q` parameter instead, the same way the table's own search box
 * does.
 *
 * Not creatable: `CreateClientDto` needs an industry and at least one
 * location as well as a name, so a client can't be conjured from a typed
 * string. Companies are added from the Companies table's own new row.
 */
export function GridCellClientCombobox({
  id,
  value,
  onValueChange,
  disabled,
  placeholder,
}: GridCellClientComboboxProps) {
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searchEnabled = debouncedQuery.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const { data } = useGetClients(
    { q: debouncedQuery, pageSize: PAGE_SIZE },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  const results = searchEnabled && data?.status === 200 ? data.data.data : [];

  // Keeps the chosen client nameable once the search that produced it has
  // been replaced — see the same pattern in GridCellLocationCombobox.
  const [picked, setPicked] = React.useState<{ id: string; name: string } | null>(null);
  const options = React.useMemo(() => {
    const rows = results.map((c) => ({ id: c.id, name: c.companyName }));
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
        searchEnabled ? 'No companies found.' : 'Type at least 2 characters to search.'
      }
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
