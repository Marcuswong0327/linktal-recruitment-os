'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { keepPreviousData } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useGetLocations } from '@/lib/api/generated/locations/locations';
import type { LocationEntity } from '@/lib/api/generated/types';
import { LEVEL_LABEL } from '@/components/LocationMultiSelect';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export interface LocationValue {
  id: string;
  name: string;
}

interface LocationComboboxProps {
  id?: string;
  value: LocationValue | null;
  onChange: (next: LocationValue | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Search-as-you-type single-select over the Location catalog — same
 * server-searched shape as `LocationMultiSelect`, but for entities that carry
 * one most-specific Location node (Candidate.locationId, JobOrder.locationId)
 * rather than a set. `value` carries its own name so an already-known
 * location (e.g. the entity's current one, loaded with the page) displays
 * without an extra lookup — only typing a new search hits the API.
 */
export function LocationCombobox({ id, value, onChange, disabled = false, placeholder = 'Search locations…' }: LocationComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const searchEnabled = debouncedQuery.length >= MIN_QUERY_LENGTH;
  const { data, isFetching } = useGetLocations(
    { q: debouncedQuery, take: 20 },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  const results: LocationEntity[] = searchEnabled && data?.status === 200 ? data.data : [];
  const resultsById = React.useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);
  const items = React.useMemo(() => results.map((r) => r.id), [results]);

  function handleValueChange(nextId: string | null) {
    if (!nextId) {
      onChange(null);
      return;
    }
    const location = resultsById.get(nextId);
    onChange(location ? { id: location.id, name: location.name } : { id: nextId, name: value?.name ?? nextId });
  }

  return (
    <Combobox.Root
      items={items}
      filter={null} // server-searched — nothing to filter locally
      value={value?.id ?? null}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={(valueId: string) => resultsById.get(valueId)?.name ?? valueId}
      itemToStringValue={(valueId: string) => valueId}
      disabled={disabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setInputValue('');
      }}
    >
      <Combobox.Trigger
        id={id}
        className="flex h-9 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-muted-foreground')}>
          {value?.name ?? placeholder}
        </span>
        <Combobox.Icon className="text-muted-foreground">
          <ChevronDown className={cn('pointer-events-none size-4 shrink-0 transition-transform', open && 'rotate-180')} />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="flex items-center gap-1.5 p-1.5">
              <Combobox.Input
                placeholder="Search for a place…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              {!searchEnabled ? 'Type at least 2 characters to search.' : 'No locations found.'}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(valueId: string) => {
                const location = resultsById.get(valueId);
                return (
                  <Combobox.Item
                    key={valueId}
                    value={valueId}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="min-w-0 flex-1 truncate">{location?.name ?? valueId}</span>
                    {location ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{LEVEL_LABEL[location.level]}</span>
                    ) : null}
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
