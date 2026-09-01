'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const CREATE_SENTINEL = '__create__';

export interface CreatableComboboxOption {
  id: string;
  name: string;
  /** Renders the option as a colored pill (trigger + list item) instead of plain text — e.g. per-role-type coloring. Omit for the default plain look. */
  triggerClassName?: string;
}

interface CreatableComboboxProps {
  id?: string;
  /** Selected option's id — '' for none. */
  value: string;
  onValueChange: (id: string) => void;
  /** Existing rows to search/pick from. */
  options: CreatableComboboxOption[];
  /** Called for "Add <name>" — must persist it and return the created (or already-existing) row. */
  onCreate: (name: string) => Promise<CreatableComboboxOption>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * 'input' (default): the plain form-field look — a bordered box, used in
   * sheets/forms. 'badge': the same trigger design as `ComboboxSelect`'s
   * table-cell pills (Consultants' Role/Status columns) — a full-cell click
   * overlay behind a centered, colored Badge — for use as a DataGrid cell.
   */
  variant?: 'input' | 'badge';
  /** Accessible label for the trigger — required (and only used) when `variant="badge"`, same as `ComboboxSelect`'s `title`. */
  title?: string;
  /**
   * Shows a small ✕ on the trigger, next to the chevron, once a value is
   * selected — clears back to '' without opening the popup. Only meaningful
   * for genuinely optional fields (e.g. Specialization); omit for a required
   * one (e.g. Industry) where clearing would just reintroduce the validation
   * error the picker exists to satisfy. 'badge' variant ignores this — its
   * pill is small enough that a second click target isn't worth it, and
   * every 'badge' usage so far already has its own dedicated "unset" value
   * (e.g. Uncategorized) reachable from the list itself.
   */
  clearable?: boolean;
  /**
   * Opts into server-side search: the component reports its debounced search
   * text here and stops filtering locally, taking `options` as already
   * matching. Needed for any catalog bigger than one page — Job Titles runs
   * to thousands of rows against a `take` the API caps at 200, so a
   * pre-fetched page can only ever offer the alphabetical first slice and
   * everything after it is unreachable and gets re-created as a duplicate.
   */
  onQueryChange?: (q: string) => void;
  /** Spinner in the popup while the caller's search request is in flight. */
  isFetching?: boolean;
  /**
   * Name of the currently selected option, for when it isn't in `options` —
   * with server search the visible page rarely contains the existing value.
   */
  selectedLabel?: string;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Trigger + searchable popup for picking (or creating) a row — same shape as
 * `ConsultantCombobox`, minus the avatar: a closed trigger showing the
 * current selection, opening onto its own search box and item list. Typing a
 * name that doesn't exist yet offers "Add <name>", which persists it and
 * commits an id instead of raw text, so the value stays a real reference to
 * a shared, reusable row instead of fragmenting near-duplicate spellings.
 */
export function CreatableCombobox({
  id,
  value,
  onValueChange,
  options,
  onCreate,
  placeholder,
  disabled,
  className,
  variant = 'input',
  title,
  clearable = false,
  onQueryChange,
  isFetching = false,
  selectedLabel,
}: CreatableComboboxProps) {
  const byId = React.useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const selected = byId.get(value);
  const serverSearched = onQueryChange !== undefined;
  // Falls back to `selectedLabel` because a server-searched list usually
  // doesn't contain the already-selected row.
  const label = selected?.name ?? (value ? (selectedLabel ?? '') : '');

  // The popup's own search text — separate from the trigger's displayed
  // value, and reset each time the popup opens so it always starts as a
  // fresh search rather than showing whatever was last typed.
  const [inputValue, setInputValue] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  // Only genuinely needed by the 'badge' trigger's full-cell overlay button
  // below (mirrors ComboboxSelect), which has to open the popup from an
  // element other than Combobox.Trigger itself. Only passed to Combobox.Root
  // as a *controlled* `open` for that variant — controlling it for the plain
  // 'input' trigger too used to seem harmless (it toggles itself via its own
  // Combobox.Trigger click regardless), but it isn't: the extra React
  // state round-trip between that click and the controlled `open` prop
  // updating lands one render behind Base UI's own position sync, so the
  // popup would flash at a stale position on first open.
  const [open, setOpen] = React.useState(false);

  // Debounced so typing doesn't fire a request per keystroke. The ref keeps
  // the effect off the caller's callback identity, which is usually a fresh
  // closure each render.
  const onQueryChangeRef = React.useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;
  const [reportedQuery, setReportedQuery] = React.useState('');
  React.useEffect(() => {
    if (!serverSearched) return;
    const timer = setTimeout(() => {
      const next = inputValue.trim();
      setReportedQuery(next);
      onQueryChangeRef.current?.(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue, serverSearched]);

  const trimmed = inputValue.trim();
  const hasExactMatch = options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase());
  // Prefix matches first, mirroring the ranking the catalog endpoints apply
  // server-side (see `rankedNameSearch` in the API). Filtering alone leaves
  // the list in the alphabetical order it arrived in, which buries the entry
  // that actually starts with what was typed: searching "assistant" put
  // "Admin Assistant" and "Administrative Assistant" above "Assistant
  // Manager". `sort` is stable and `options` arrives alphabetical, so
  // same-rank entries keep that order.
  const lower = trimmed.toLowerCase();
  const filtered =
    serverSearched || !trimmed
      ? options
      : options
          .filter((o) => o.name.toLowerCase().includes(lower))
          .sort(
            (a, b) =>
              Number(b.name.toLowerCase().startsWith(lower)) -
              Number(a.name.toLowerCase().startsWith(lower)),
          );
  // While a server search is still settling — mid-debounce, or the request in
  // flight — `options` are the *previous* query's results, so `hasExactMatch`
  // is answering the wrong question. Offering "Add <name>" then invites
  // someone to re-create a row that does exist and just hasn't loaded yet,
  // which is the duplicate-fragmenting this picker exists to prevent.
  const searchSettled = !serverSearched || (!isFetching && reportedQuery === trimmed);
  const items =
    trimmed && !hasExactMatch && searchSettled
      ? [...filtered.map((o) => o.id), CREATE_SENTINEL]
      : filtered.map((o) => o.id);

  async function handleSelect(itemId: string | null) {
    if (itemId === null) return;
    if (itemId === CREATE_SENTINEL) {
      const name = trimmed;
      if (!name) return;
      setCreating(true);
      try {
        const created = await onCreate(name);
        onValueChange(created.id);
      } catch {
        // Caller's mutation already surfaces the error (toast); just stop
        // treating this as in flight so the user can retry.
      } finally {
        setCreating(false);
      }
      return;
    }
    onValueChange(itemId);
  }

  return (
    <Combobox.Root
      items={items}
      filter={null} // items are already filtered against inputValue above
      value={value}
      onValueChange={handleSelect}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      open={variant === 'badge' ? open : undefined}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setInputValue('');
      }}
      itemToStringValue={(item: string) => item}
      disabled={disabled || creating}
    >
      {variant === 'badge' ? (
        <>
          {/* Full-cell click target — same pattern as ComboboxSelect/TagMultiSelect,
              which need it absolute against the TableCell rather than sized via the
              trigger's own (much smaller) box. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            disabled={disabled}
            onClick={() => setOpen(true)}
            className={cn(
              'absolute inset-0 rounded-md outline-none transition-colors hover:bg-accent/50 disabled:pointer-events-none',
              open && 'bg-accent/50',
            )}
          />
          <Combobox.Trigger
            id={id}
            aria-label={title ? `Change ${title.toLowerCase()}` : undefined}
            className={cn(
              'relative inline-flex max-w-full items-center gap-1 rounded-md border border-transparent px-1 py-0.5 text-left outline-none transition-colors hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50',
              className,
            )}
          >
            <Combobox.Value>
              {() => (
                <Badge className={cn('rounded-md font-normal', selected?.triggerClassName)}>
                  {label || placeholder || 'Select…'}
                </Badge>
              )}
            </Combobox.Value>
          </Combobox.Trigger>
        </>
      ) : (
        <Combobox.Trigger
          id={id}
          className={cn(
            'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span
            className={cn('min-w-0 flex-1 truncate text-left', !label && 'text-muted-foreground')}
          >
            <Combobox.Value>
              {() =>
                label && selected?.triggerClassName ? (
                  <Badge className={cn('rounded-md font-normal', selected.triggerClassName)}>{label}</Badge>
                ) : (
                  label || placeholder || 'Select…'
                )
              }
            </Combobox.Value>
          </span>
          {clearable && value ? (
            // role="button", not a nested <button> — this sits inside
            // Combobox.Trigger's own <button>, and nested interactive
            // elements break hydration (same reasoning as LocationMultiSelect's
            // pill removal control).
            <span
              role="button"
              tabIndex={0}
              aria-label={title ? `Clear ${title.toLowerCase()}` : 'Clear'}
              onClick={(e) => {
                e.stopPropagation();
                onValueChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onValueChange('');
                }
              }}
              className="cursor-pointer rounded-full p-0.5 text-muted-foreground opacity-70 outline-none hover:opacity-100"
            >
              <X className="size-3.5" />
            </span>
          ) : null}
          <Combobox.Icon className="text-muted-foreground">
            <ChevronDown className="pointer-events-none size-4 shrink-0" />
          </Combobox.Icon>
        </Combobox.Trigger>
      )}

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            className={cn(
              // 'badge' trigger is a small pill — anchoring the popup to its
              // width (as the 'input' trigger's popup does, matching its own
              // wide box) would make the search box and list cramped, so it
              // gets a fixed width instead, same as ComboboxSelect's popup.
              variant === 'badge' ? 'w-56' : 'w-(--anchor-width)',
              'max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10',
            )}
          >
            <div className="flex items-center gap-1.5 p-1.5">
              <Combobox.Input
                placeholder="Search or add new…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              No matches — keep typing to add a new value.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
              {(itemId: string) => {
                const isCreate = itemId === CREATE_SENTINEL;
                const item = byId.get(itemId);
                const itemLabel = isCreate ? trimmed : (item?.name ?? itemId);
                return (
                  <Combobox.Item
                    key={itemId}
                    value={itemId}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {isCreate ? <Plus className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    <span className="min-w-0 flex-1 truncate">
                      {isCreate ? (
                        `Add "${itemLabel}"`
                      ) : item?.triggerClassName ? (
                        <Badge className={cn('rounded-md font-normal', item.triggerClassName)}>{itemLabel}</Badge>
                      ) : (
                        itemLabel
                      )}
                    </span>
                    <Combobox.ItemIndicator className="shrink-0">
                      <Check className="size-4 !text-primary" />
                    </Combobox.ItemIndicator>
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
