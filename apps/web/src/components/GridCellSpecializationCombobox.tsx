'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import {
  GridCellCombobox,
  GRID_CELL_MIN_QUERY_LENGTH,
} from '@/components/GridCellCombobox';
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
  /**
   * Narrows the search to one industry. Now that the Companies grid has an
   * Industry cell of its own, the new row picks industry first and this keeps
   * the two rungs consistent — a specialization from another industry would
   * contradict the `industryId` sitting beside it.
   */
  industryId?: string;
  /**
   * Grows the catalog from the cell. Omit for a pick-only field — pass it only
   * when the caller holds `specialization:create` *and* knows the parent
   * industry, since `POST /specializations` requires one.
   */
  onCreate?: (name: string) => Promise<PickedSpecialization>;
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
 * required. The Companies grid now has its own Industry cell, so that cell is
 * the primary source and this is the fallback for a row where industry hasn't
 * been touched; pass `industryId` to keep the two in step.
 *
 * Creatable only when the caller passes `onCreate` — which needs the parent
 * industry to be known. In the Companies new row that's the Industry cell
 * beside it, so no "which industry?" prompt is needed; a saved row asks via
 * NewSpecializationDialog instead, since changing its answer also retags the
 * company.
 */
export function GridCellSpecializationCombobox({
  id,
  value,
  onValueChange,
  disabled,
  placeholder,
  industryId,
  onCreate,
}: GridCellSpecializationComboboxProps) {
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Same floor as City Coverage / GridCellCombobox — no first-page dump
  // before the consultant has typed.
  const searchEnabled = debouncedQuery.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const { data } = useGetSpecializations(
    {
      q: debouncedQuery,
      take: TAKE,
      ...(industryId ? { industryIds: [industryId] } : {}),
    },
    {
      query: {
        enabled: searchEnabled && Boolean(industryId),
        placeholderData: keepPreviousData,
      },
    },
  );
  const results: SpecializationEntity[] =
    searchEnabled && data?.status === 200 ? data.data : [];

  // Keeps the chosen row nameable after the search that produced it has been
  // replaced — see the same pattern in GridCellLocationCombobox.
  const [picked, setPicked] = React.useState<PickedSpecialization | null>(null);
  // A row created moments ago isn't in `options` yet, and GridCellCombobox
  // reports the selection by id immediately after onCreate resolves — too soon
  // for a setState to have landed. Without this the lookup below misses and
  // the brand-new specialization would be reported as "cleared".
  const justCreated = React.useRef<PickedSpecialization | null>(null);
  const options = React.useMemo(() => {
    const rows = results.map((r) => ({ id: r.id, name: r.name, industryId: r.industryId }));
    return picked && !rows.some((r) => r.id === picked.id) ? [...rows, picked] : rows;
  }, [results, picked]);

  return (
    <GridCellCombobox
      id={id}
      value={value}
      onValueChange={(nextId) => {
        const next =
          options.find((o) => o.id === nextId) ??
          (justCreated.current?.id === nextId ? justCreated.current : null);
        justCreated.current = null;
        setPicked(next);
        onValueChange(next);
      }}
      options={options}
      onCreate={
        onCreate
          ? async (name) => {
              const created = await onCreate(name);
              justCreated.current = created;
              return { id: created.id, name: created.name };
            }
          : undefined
      }
      serverSearched
      onQueryChange={setQuery}
      emptyMessage={
        !industryId
          ? 'Pick an industry first.'
          : searchEnabled
            ? 'No specializations found.'
            : 'Type at least 2 characters to search.'
      }
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
