'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';

export interface GridCellComboboxOption {
  id: string;
  name: string;
}

const CREATE_SENTINEL = '__create__';

/** Same floor as City Coverage (`useLocationSearch`) — no catalog dump on focus. */
export const GRID_CELL_MIN_QUERY_LENGTH = 2;

interface GridCellComboboxProps {
  id?: string;
  /** Selected option's id — '' for none. */
  value: string;
  onValueChange: (id: string) => void;
  options: GridCellComboboxOption[];
  /** Omit for a pick-only field. When given, typing a name that doesn't exist offers "Add <name>". */
  onCreate?: (name: string) => Promise<GridCellComboboxOption>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * The options are already narrowed by the server for the current query, so
   * don't filter them again locally — for catalogs too large to hold in the
   * client (Location). Pair with `onQueryChange` to drive the search, and
   * `emptyMessage` to explain a deliberately empty list.
   */
  serverSearched?: boolean;
  /** Fires as the user types (raw, undebounced) — the caller owns the search. */
  onQueryChange?: (query: string) => void;
  /** Replaces the default empty-list copy when the query is long enough to search. */
  emptyMessage?: string;
  /**
   * Empty the box after a pick instead of leaving the chosen name in it — for
   * a cell that collects several values, where the box is a staging area and
   * the picks live outside it as chips.
   */
  clearOnSelect?: boolean;
  /**
   * Characters required before the popup opens and options / "Add …" appear.
   * Matches City Coverage (2). Focus alone never opens the list unless
   * `openOnFocus` is set (small fixed enums).
   */
  minQueryLength?: number;
  /**
   * Open the full option list on focus/click with no typing required —
   * for small fixed sets (Status, Quality) where a catalog dump is fine
   * and a Select-style popout is what users expect. Implies treating an
   * empty query as "show everything" when `minQueryLength` is 0.
   */
  openOnFocus?: boolean;
}

/**
 * A text box that recommends as you type — for the new-row editors in a
 * DataGrid (see `DataGridProps.newRow`).
 *
 * The distinction from `CreatableCombobox` is which comes first. That one is
 * a *button* showing the current selection, which opens a popup that contains
 * a search box: you click, then type. This one is the input itself, sitting
 * flush in the cell like a spreadsheet cell — you type, and matches appear
 * beneath. Nothing to click before entering a value, which is what makes
 * tabbing across a row and typing feel like Excel rather than like filling
 * in a form.
 *
 * Like City Coverage: focus alone pops out nothing. Matches (and optional
 * "Add <name>") appear only after the user has typed at least
 * `minQueryLength` characters.
 *
 * A committed value is still an id, never raw text: typing narrows the list,
 * but a record only lands when an option (or "Add <name>") is chosen, so
 * near-duplicate spellings can't fragment the catalog.
 */
export function GridCellCombobox({
  id,
  value,
  onValueChange,
  options,
  onCreate,
  placeholder,
  disabled,
  className,
  serverSearched = false,
  onQueryChange,
  emptyMessage = 'No matches.',
  clearOnSelect = false,
  minQueryLength = GRID_CELL_MIN_QUERY_LENGTH,
  openOnFocus = false,
}: GridCellComboboxProps) {
  const byId = React.useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const selectedName = byId.get(value)?.name ?? '';

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = React.useState(selectedName);
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Mirrors an externally-driven `value` change back into the box — the
  // new-row clearing itself after a successful save is the case that
  // matters. Deliberately keyed on `value` alone: adding `selectedName`
  // (or `byId`) would also re-fire when the options list reloads, wiping
  // out whatever the user was part-way through typing.
  React.useEffect(() => {
    // A value with no matching option is a just-created row the caller's
    // list hasn't refetched yet — `handleSelect` has already put its name
    // in the box, and resolving an unknown id to '' here would blank it
    // out the moment the creation succeeded.
    const name = byId.get(value)?.name;
    if (value !== '' && name === undefined) return;
    setInputValue(name ?? '');
  }, [value]);

  // While the box still reads back the committed selection, treat that as
  // "not searching yet" — same as an empty box. Searching only starts once
  // the typed text diverges from the held label.
  const trimmed = inputValue.trim();
  const query = trimmed && trimmed !== selectedName ? trimmed : '';
  const searchReady = query.length >= minQueryLength;
  const lowered = query.toLowerCase();

  const filtered =
    !searchReady && !openOnFocus
      ? []
      : query && !serverSearched
        ? options.filter((o) => o.name.toLowerCase().includes(lowered))
        : options;

  const hasExactMatch = searchReady && options.some((o) => o.name.toLowerCase() === lowered);
  const items =
    searchReady && onCreate && query && !hasExactMatch
      ? [...filtered.map((o) => o.id), CREATE_SENTINEL]
      : filtered.map((o) => o.id);

  const listEmptyMessage = searchReady
    ? emptyMessage
    : minQueryLength > 0
      ? `Type at least ${minQueryLength} characters to search.`
      : emptyMessage;

  async function handleSelect(itemId: string | null) {
    if (itemId === null || creating) return;
    if (itemId === CREATE_SENTINEL) {
      if (!onCreate || !query || !searchReady) return;
      setCreating(true);
      try {
        const created = await onCreate(query);
        onValueChange(created.id);
        setInputValue(created.name);
        // Same close the pick-an-existing-option path below does. Leaving
        // it open kept `aria-expanded="true"` on the input, which the
        // row's key handler reads as "a list is open, this Enter isn't
        // mine" — so every Enter after a create was swallowed.
        setOpen(false);
        // Base UI moves focus around on selection, and the create resolves a
        // tick later than the keypress that started it — put the caret back
        // so the next Enter reaches the row (and submits it) instead of
        // landing on <body> and requiring a click back into the cell.
        inputRef.current?.focus();
      } catch {
        // The caller's mutation already toasts; just stop showing this as
        // in flight so it can be retried.
      } finally {
        setCreating(false);
      }
      return;
    }
    onValueChange(itemId);
    setInputValue(clearOnSelect ? '' : (byId.get(itemId)?.name ?? ''));
    if (clearOnSelect) onQueryChange?.('');
    setOpen(false);
  }

  return (
    <Combobox.Root
      items={items}
      filter={null} // already filtered against inputValue above
      value={value}
      onValueChange={handleSelect}
      inputValue={inputValue}
      onInputValueChange={(next, details) => {
        setInputValue(next);
        // Only genuine typing should reopen the list and invalidate the
        // held id. Base UI writes the chosen option's label into this same
        // input on item press (single-selection with the input as the
        // anchor rather than inside the popup), and treating that fill as
        // an edit would clear the selection the instant it was made.
        if (details.reason !== 'input-change') return;
        const nextQuery = next.trim();
        const diverged = nextQuery !== '' && nextQuery !== byId.get(value)?.name;
        setOpen(diverged && nextQuery.length >= minQueryLength);
        onQueryChange?.(next);
        // Editing away from the selected option's name drops the id with
        // it — otherwise the cell would look half-typed while still
        // holding, and on Enter saving, the previous selection.
        if (value && next !== byId.get(value)?.name) onValueChange('');
      }}
      open={open}
      onOpenChange={(next) => {
        // Catalog fields stay closed until the query clears the floor —
        // focus alone must not dump thousands of rows. Small enums pass
        // `openOnFocus` so click/tab opens the full list immediately.
        if (next && !searchReady && !openOnFocus) {
          setOpen(false);
          return;
        }
        setOpen(next);
      }}
      // Keeps the top item highlighted as you type, so Enter commits it
      // without an arrow-key press first. With no match left, the only item
      // is "Add <name>" — which is what makes typing a role that doesn't
      // exist yet and pressing Enter create it. Base UI highlights nothing
      // by default, and Enter on nothing is a no-op.
      autoHighlight
      itemToStringValue={(item: string) => item}
      // What Base UI writes into the input when an item is chosen. Without
      // it the raw id lands in the box (see `onInputValueChange` above).
      itemToStringLabel={(item: string) =>
        item === CREATE_SENTINEL ? query : (byId.get(item)?.name ?? '')
      }
      // NOT disabled while `creating`: disabling the input blurs it, which
      // drops the caret out of the row entirely. Re-entry is guarded at the
      // top of `handleSelect` instead.
      disabled={disabled}
    >
      <Combobox.Input
        ref={inputRef}
        id={id}
        placeholder={placeholder}
        {...noBrowserAutofill}
        onFocus={() => {
          if (openOnFocus && !disabled) setOpen(true);
        }}
        className={cn(
          'h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-input focus:border-ring focus:bg-background disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-64 w-(--anchor-width) max-w-(--available-width) min-w-48 origin-(--transform-origin) overflow-y-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <Combobox.Empty className="px-3 py-2 text-center text-sm text-muted-foreground empty:hidden">
              {listEmptyMessage}
            </Combobox.Empty>
            <Combobox.List>
              {(itemId: string) => {
                const isCreate = itemId === CREATE_SENTINEL;
                const label = isCreate ? query : (byId.get(itemId)?.name ?? itemId);
                return (
                  <Combobox.Item
                    key={itemId}
                    value={itemId}
                    className="flex min-h-8 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {isCreate ? <Plus className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    <span className="min-w-0 flex-1 truncate">
                      {isCreate ? `Add "${label}"` : label}
                    </span>
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
