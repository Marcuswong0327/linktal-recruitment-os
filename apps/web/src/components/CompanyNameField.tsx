'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { Combobox } from '@base-ui/react/combobox';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';
import { GRID_CELL_MIN_QUERY_LENGTH } from '@/components/GridCellCombobox';
import {
  scoreCompanyNameMatch,
  type ExistingCompanyMatch,
} from '@/components/GridCellCompanyNameCombobox';
import { useGetClients } from '@/lib/api/generated/clients/clients';

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 20;
const CREATE_SENTINEL = '__create__';

interface CompanyNameFieldProps {
  id?: string;
  value: string;
  onValueChange: (name: string) => void;
  onSelectExisting: (match: ExistingCompanyMatch) => void;
  disabled?: boolean;
}

/**
 * Form-sheet counterpart to `GridCellCompanyNameCombobox` — same ≥2-char
 * similar-company search and "Add as new anyway" path, in the bordered
 * Input look used by create sheets.
 */
export function CompanyNameField({
  id,
  value,
  onValueChange,
  onSelectExisting,
  disabled,
}: CompanyNameFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searchReady = debouncedQuery.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const { data } = useGetClients(
    { q: debouncedQuery, pageSize: PAGE_SIZE },
    { query: { enabled: searchReady, placeholderData: keepPreviousData } },
  );
  const results = searchReady && data?.status === 200 ? data.data.data : [];

  const matches = React.useMemo(() => {
    const ranked: ExistingCompanyMatch[] = results.map((c) => ({
      id: c.id,
      name: c.companyName,
      score: scoreCompanyNameMatch(debouncedQuery, c.companyName),
    }));
    ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return ranked;
  }, [results, debouncedQuery]);

  const byId = React.useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const trimmed = value.trim();
  const listReady = trimmed.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const hasExactIgnoreCase = matches.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
  const items = listReady ? [...matches.map((m) => m.id), CREATE_SENTINEL] : [];

  function handleSelect(itemId: string | null) {
    if (itemId === null) return;
    if (itemId === CREATE_SENTINEL) {
      onValueChange(trimmed);
      setOpen(false);
      return;
    }
    const match = byId.get(itemId);
    if (!match) return;
    onSelectExisting(match);
    setOpen(false);
  }

  return (
    <Combobox.Root
      items={items}
      filter={null}
      value=""
      onValueChange={handleSelect}
      inputValue={value}
      onInputValueChange={(next, details) => {
        if (details.reason !== 'input-change') return;
        onValueChange(next);
        setQuery(next);
        setOpen(next.trim().length >= GRID_CELL_MIN_QUERY_LENGTH);
      }}
      open={open}
      onOpenChange={(next) => {
        if (next && !listReady) {
          setOpen(false);
          return;
        }
        setOpen(next);
      }}
      autoHighlight
      itemToStringValue={(item: string) => item}
      itemToStringLabel={(item: string) =>
        item === CREATE_SENTINEL ? trimmed : (byId.get(item)?.name ?? '')
      }
      disabled={disabled}
    >
      <Combobox.Input
        id={id}
        placeholder="Company name"
        {...noBrowserAutofill}
        className="h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            className={cn(
              'max-h-64 w-(--anchor-width) max-w-(--available-width) min-w-56 origin-(--transform-origin) overflow-y-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10',
            )}
          >
            <Combobox.Empty className="px-3 py-2 text-center text-sm text-muted-foreground empty:hidden">
              {listReady
                ? 'No similar companies — Add as new below, or keep typing.'
                : 'Type at least 2 characters to search.'}
            </Combobox.Empty>
            <Combobox.List>
              {(itemId: string) => {
                const isCreate = itemId === CREATE_SENTINEL;
                const match = isCreate ? null : byId.get(itemId);
                return (
                  <Combobox.Item
                    key={itemId}
                    value={itemId}
                    className="flex min-h-8 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {isCreate ? (
                      <>
                        <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {hasExactIgnoreCase
                            ? `Add as new "${trimmed}" anyway`
                            : `Add as new "${trimmed}"`}
                        </span>
                      </>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{match?.name}</span>
                    )}
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
