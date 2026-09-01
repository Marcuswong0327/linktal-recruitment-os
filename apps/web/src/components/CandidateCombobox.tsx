'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { keepPreviousData } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';
import type { CandidateEntity } from '@/lib/api/generated/types';
import { candidateFullName } from '@/features/candidates/schema';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const PAGE_SIZE = 20;

interface CandidateComboboxProps {
  id?: string;
  value: CandidateEntity | null;
  onChange: (next: CandidateEntity | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Rendered, but not selectable — e.g. candidates already in this job order's pipeline. */
  disabledIds?: ReadonlySet<string>;
  /** Right-aligned note explaining why a `disabledIds` row can't be picked. */
  disabledNote?: string;
}

/**
 * Search-as-you-type candidate picker — same server-searched shape as
 * `LocationCombobox`.
 *
 * Deliberately *not* handed an array to filter locally: there are thousands of
 * candidates, so any pre-fetched page (this used to be a flat `pageSize: 100`)
 * left the overwhelming majority unreachable, and which 100 you got was
 * arbitrary. `GET /candidates?q=` searches name, email, phone, displayId,
 * current role/company and the resolved location/industry/role-type names, so
 * the search belongs on the server.
 *
 * `value` is the whole entity rather than an id because every caller needs
 * fields off it (role type, location, industryId/locationId for the
 * mismatch check) and, with local filtering off, there's no array left to look
 * an id up in. A caller holding only an id should fetch the candidate and pass
 * the entity.
 */
export function CandidateCombobox({
  id,
  value,
  onChange,
  disabled = false,
  className,
  placeholder = 'Select a candidate',
  disabledIds,
  disabledNote = 'Already submitted',
}: CandidateComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const searchEnabled = debouncedQuery.length >= MIN_QUERY_LENGTH;
  const { data, isFetching, isError } = useGetCandidates(
    { q: debouncedQuery, pageSize: PAGE_SIZE },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  // Paginated envelope — rows are one level deeper than LocationCombobox's.
  const results: CandidateEntity[] = searchEnabled && data?.status === 200 ? data.data.data : [];
  const total = searchEnabled && data?.status === 200 ? data.data.total : 0;

  const resultsById = React.useMemo(() => new Map(results.map((c) => [c.id, c])), [results]);
  const items = React.useMemo(() => results.map((c) => c.id), [results]);

  function handleValueChange(nextId: string | null) {
    if (!nextId) return onChange(null);
    // Belt and braces — base-ui already blocks a disabled item's click and its
    // Enter-to-select, so this only guards a future programmatic caller.
    if (disabledIds?.has(nextId)) return;
    onChange(resultsById.get(nextId) ?? value);
  }

  return (
    <Combobox.Root
      items={items}
      filter={null} // server-searched — nothing to filter locally
      value={value?.id ?? null}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={(candidateId: string) => {
        const candidate = resultsById.get(candidateId);
        return candidate ? candidateFullName(candidate) || 'Unnamed candidate' : candidateId;
      }}
      itemToStringValue={(candidateId: string) => candidateId}
      disabled={disabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setInputValue('');
      }}
    >
      <Combobox.Trigger
        id={id}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        {/* Rendered from `value`, not looked up in `items` — with the query
            reset on open, the selected candidate usually isn't in the current
            result set at all. */}
        <span className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-muted-foreground')}>
          {value ? candidateFullName(value) || 'Unnamed candidate' : placeholder}
        </span>
        <Combobox.Icon className="text-muted-foreground">
          <ChevronDown className={cn('pointer-events-none size-4 shrink-0 transition-transform', open && 'rotate-180')} />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-80 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="flex items-center gap-1.5 p-1.5">
              <Combobox.Input
                placeholder="Search name, email or phone…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              {!searchEnabled
                ? 'Type at least 2 characters to search.'
                : isError
                  ? "Couldn't search candidates."
                  : 'No candidates found.'}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(candidateId: string) => {
                const candidate = resultsById.get(candidateId);
                const isDisabled = disabledIds?.has(candidateId) ?? false;
                // Two secondary lines, because a search hit has to answer two
                // different questions. The first is "is this the right kind of
                // person?" — role type (the consultant's classification, and
                // the reason this picker exists), falling back to the
                // employer's `currentRole` and then to industry so an untagged
                // candidate is never a blank row. The second is "is this the
                // record I typed?" — the contact details that were actually
                // matched against, so a half-typed phone number can be checked
                // against the full one rather than taken on faith.
                const attributes = [
                  candidate?.jobRoleType ?? candidate?.currentRole ?? candidate?.industry,
                  candidate?.location,
                ].filter(Boolean) as string[];
                const contacts = [candidate?.mobile, candidate?.email].filter(Boolean) as string[];
                return (
                  <Combobox.Item
                    key={candidateId}
                    value={candidateId}
                    disabled={isDisabled}
                    className="flex min-h-9 cursor-pointer items-start gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        <Match text={candidate ? candidateFullName(candidate) || 'Unnamed candidate' : candidateId} query={debouncedQuery} />
                      </span>
                      {attributes.length > 0 ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {attributes.join(' · ')}
                        </span>
                      ) : null}
                      {contacts.length > 0 ? (
                        <span className="truncate text-xs text-muted-foreground tabular-nums">
                          {contacts.map((contact, i) => (
                            <React.Fragment key={contact}>
                              {i > 0 ? ' · ' : null}
                              <Match text={contact} query={debouncedQuery} />
                            </React.Fragment>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    {isDisabled ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{disabledNote}</span>
                    ) : null}
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
            {/* Results are capped and unranked (createdAt desc), so a common
                surname silently truncates without this. */}
            {searchEnabled && total > results.length ? (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Showing the first {results.length} of {total} matches — keep typing to narrow.
              </p>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/**
 * Renders `text` with the part matching `query` emphasised, so a result can be
 * checked against what was actually typed — the point of the whole search.
 *
 * Phone numbers need their own pass. The stored value carries separators the
 * query won't ("018-323 7188" vs a typed "018323"), and the API matches on
 * digits alone, so a plain substring search finds nothing and the one field
 * the user is squinting at would be the one left unhighlighted. Instead the
 * digits are matched, then mapped back onto their positions in the original
 * string.
 */
function Match({ text, query }: { text: string; query: string }) {
  const range = React.useMemo(() => matchRange(text, query), [text, query]);
  if (!range) return <>{text}</>;
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-transparent font-semibold text-foreground">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function matchRange(text: string, query: string): [number, number] | null {
  const trimmed = query.trim();
  if (!trimmed || !text) return null;

  const plain = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (plain !== -1) return [plain, plain + trimmed.length];

  // Digit-wise fallback, for a phone number written differently than typed.
  const queryDigits = trimmed.replace(/\D/g, '');
  if (!queryDigits) return null;

  const positions: number[] = [];
  let digits = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] >= '0' && text[i] <= '9') {
      positions.push(i);
      digits += text[i];
    }
  }
  const at = digits.indexOf(queryDigits);
  if (at === -1) return null;
  return [positions[at], positions[at + queryDigits.length - 1] + 1];
}
