'use client';

import * as React from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { Combobox } from '@base-ui/react/combobox';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';
import {
  GRID_CELL_MIN_QUERY_LENGTH,
} from '@/components/GridCellCombobox';
import { useGetClients } from '@/lib/api/generated/clients/clients';

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 20;
const CREATE_SENTINEL = '__create__';

export interface ExistingCompanyMatch {
  id: string;
  name: string;
  /** 0–100, higher = closer to what was typed (case-insensitive). */
  score: number;
}

/**
 * How closely `candidate` matches the typed `query`.
 *
 * Not embeddings — a cheap, deterministic score so "southern steelworks"
 * ranks under "Southern Steelworks" without needing a new API. Exact
 * ignore-case → 100; prefix → 90; substring → 75; else 0 (shouldn't appear
 * once the server already filtered with `contains`).
 */
export function scoreCompanyNameMatch(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 90;
  if (c.includes(q) || q.includes(c)) return 75;
  return 0;
}

interface GridCellCompanyNameComboboxProps {
  id?: string;
  /** Typed / committed company name — free text, not a client id. */
  value: string;
  onValueChange: (name: string) => void;
  /**
   * User picked an existing company from the list instead of creating.
   * Caller typically navigates to that company and clears the new-row name.
   */
  onSelectExisting: (match: ExistingCompanyMatch) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Company-name cell for the Companies new-row: type ≥2 characters and
 * similar existing companies appear (case-insensitive via `GET /clients?q=`).
 *
 * Choosing one opens that company (no second insert). Choosing
 * `Add as new "…"` keeps the typed name so the row can still create a
 * near-duplicate if the consultant insists.
 */
export function GridCellCompanyNameCombobox({
  id,
  value,
  onValueChange,
  onSelectExisting,
  disabled,
  placeholder = 'Company name',
}: GridCellCompanyNameComboboxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

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

  const trimmed = inputValue.trim();
  const typingQuery = trimmed;
  const listReady = typingQuery.length >= GRID_CELL_MIN_QUERY_LENGTH;
  const hasExactIgnoreCase = matches.some(
    (m) => m.name.toLowerCase() === typingQuery.toLowerCase(),
  );
  // Always offer "Add as new" once they're past the floor — even when an
  // exact ignore-case hit exists, so they can insist on a second row.
  const items = listReady
    ? [...matches.map((m) => m.id), CREATE_SENTINEL]
    : [];

  function handleSelect(itemId: string | null) {
    if (itemId === null) return;
    if (itemId === CREATE_SENTINEL) {
      onValueChange(typingQuery);
      setInputValue(typingQuery);
      setOpen(false);
      inputRef.current?.focus();
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
      inputValue={inputValue}
      onInputValueChange={(next, details) => {
        setInputValue(next);
        if (details.reason !== 'input-change') return;
        onValueChange(next);
        const nextQuery = next.trim();
        setQuery(next);
        setOpen(nextQuery.length >= GRID_CELL_MIN_QUERY_LENGTH);
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
        item === CREATE_SENTINEL ? typingQuery : (byId.get(item)?.name ?? '')
      }
      disabled={disabled}
    >
      <Combobox.Input
        ref={inputRef}
        id={id}
        placeholder={placeholder}
        aria-label="Company name"
        {...noBrowserAutofill}
        className={cn(
          'h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-input focus:border-ring focus:bg-background disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-64 w-(--anchor-width) max-w-(--available-width) min-w-56 origin-(--transform-origin) overflow-y-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
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
                            ? `Add as new "${typingQuery}" anyway`
                            : `Add as new "${typingQuery}"`}
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
