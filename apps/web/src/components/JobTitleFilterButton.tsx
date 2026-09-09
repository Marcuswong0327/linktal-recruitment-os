'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { keepPreviousData } from '@tanstack/react-query';
import { Check, ChevronDown, ListFilter, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';
import { Button } from '@/components/ui/button';
import { GRID_CELL_MIN_QUERY_LENGTH } from '@/components/GridCellCombobox';
import { useGetJobTitles } from '@/lib/api/generated/job-titles/job-titles';

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 50;

export interface JobTitleFilterButtonProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  onResolve?: (id: string, name: string) => void;
  title?: string;
  compact?: boolean;
  placeholder?: string;
  labelFor?: (id: string) => string;
}

/**
 * Server-searched multi-select over Job Titles — same shape as
 * `ClientFilterButton` / `LocationFilterButton`. Catalog is ~2k rows, so
 * results only load after `GRID_CELL_MIN_QUERY_LENGTH` characters.
 */
export function JobTitleFilterButton({
  selected,
  onChange,
  onResolve,
  title = 'Role',
  compact = true,
  placeholder,
  labelFor,
}: JobTitleFilterButtonProps) {
  const [inputValue, setInputValue] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const searchEnabled = debouncedQuery.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const { data, isFetching } = useGetJobTitles(
    { q: debouncedQuery, take: PAGE_SIZE },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  const results = searchEnabled && data?.status === 200 ? data.data : [];
  const resultsById = React.useMemo(
    () => new Map(results.map((r) => [r.id, r.name])),
    [results],
  );
  const items = React.useMemo(() => {
    const ids = results.map((r) => r.id);
    const idSet = new Set(ids);
    return [...ids, ...selected.filter((id) => !idSet.has(id))];
  }, [results, selected]);

  React.useEffect(() => {
    if (!onResolve) return;
    for (const r of results) onResolve(r.id, r.name);
  }, [results, onResolve]);

  const resolveLabel = (id: string) => resultsById.get(id) ?? labelFor?.(id) ?? id;

  return (
    <Combobox.Root
      items={items}
      filter={null}
      multiple
      value={selected}
      onValueChange={onChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={resolveLabel}
      itemToStringValue={(id: string) => id}
    >
      {compact ? (
        <Combobox.Trigger
          aria-label={`Filter ${title}`}
          title={`Filter ${title}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground',
            selected.length > 0 && 'text-primary',
          )}
        >
          <ListFilter className={cn('size-4', selected.length === 0 && 'opacity-60')} />
        </Combobox.Trigger>
      ) : (
        <Combobox.Trigger
          render={
            <Button
              variant="outline"
              className={cn(
                'w-full justify-between rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
                selected.length > 0 && 'border-solid',
              )}
            />
          }
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left',
              selected.length === 0 && 'text-muted-foreground',
            )}
          >
            {selected.length === 0
              ? (placeholder ?? title)
              : selected.length === 1
                ? resolveLabel(selected[0])
                : `${selected.length} selected`}
          </span>
          <ChevronDown className="ml-auto shrink-0 opacity-50" />
        </Combobox.Trigger>
      )}

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="flex items-center gap-1.5 p-1.5">
              <Combobox.Input
                placeholder="Search for a role…"
                {...noBrowserAutofill}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              {!searchEnabled
                ? `Type at least ${GRID_CELL_MIN_QUERY_LENGTH} characters to search.`
                : 'No roles found.'}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(id: string) => {
                const checked = selected.includes(id);
                return (
                  <Combobox.Item
                    key={id}
                    value={id}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors',
                        checked && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {checked ? <Check className="size-3 !text-primary-foreground" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{resolveLabel(id)}</span>
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
