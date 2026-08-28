'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { keepPreviousData } from '@tanstack/react-query';
import { Check, ChevronDown, ListFilter, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { colorFor } from '@/components/TagMultiSelect';
import { useGetSpecializations } from '@/lib/api/generated/specializations/specializations';

const CREATE_SENTINEL = '__create__';
const DEBOUNCE_MS = 200;
// A first page rather than nothing with an empty query — same as
// CatalogMultiSelectFilter (candidates), which this shares its fetch shape
// with. Specialization is a flat name search (not a browsed tree like
// Location), so there's no ambiguous "root" to gate behind a min-length typed
// query.
const PAGE_SIZE = 50;

export interface SpecializationOption {
  id: string;
  name: string;
  /**
   * Known only when this option came from a live search result or a fresh
   * `onCreate` — not from the caller's `selected`/`selectedLabels` (the
   * consultant record doesn't carry it). `tagActions` callers (rename/delete
   * of the underlying catalog row) get whatever's known; delete-then-undo
   * degrades gracefully when it's missing — see ConsultantsTable's
   * `handleConfirmDelete`.
   */
  industryId?: string;
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Searchable, server-driven multi-select for a consultant's assigned
 * Specializations — same reasoning as `CatalogMultiSelectFilter`: 775+ rows
 * and growing, so this fetches a search-matched page (`q`/`take`) instead of
 * the whole catalog. `industryIds` (the consultant's own held industries)
 * narrows results server-side, replacing the old client-side
 * `selectableOptions` filter that required the full catalog to compute.
 *
 * Selected chips render from `selected`/`selectedLabels` (the id/name pairs
 * the caller already has from the consultant record) rather than a client
 * catalog lookup, colored by their own id — not `industryId` as the old
 * TagMultiSelect-based picker did, since resolving an arbitrary selected
 * item's industryId would need its own per-id fetch. One fewer catalog-wide
 * round trip was the whole point of this component, so that nuance is
 * dropped rather than reintroducing it a different way.
 */
export function SpecializationMultiSelect({
  title,
  selected,
  selectedLabels,
  onChange,
  industryIds,
  disabled = false,
  onCreate,
  tagActions,
}: {
  title: string;
  selected: string[];
  /** Names, parallel to `selected` — from the same record (e.g. Consultant.specializations). */
  selectedLabels: string[];
  onChange: (ids: string[]) => void;
  /** Narrows results to specializations under these industries (OR). Omit/empty for an unrestricted search. */
  industryIds?: string[];
  disabled?: boolean;
  onCreate?: (name: string) => Promise<SpecializationOption>;
  tagActions?: {
    onEdit?: (option: SpecializationOption) => void;
    onDelete?: (option: SpecializationOption) => void;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const debouncedQuery = useDebounced(inputValue, DEBOUNCE_MS);
  const [creating, setCreating] = React.useState(false);

  const { data, isFetching } = useGetSpecializations(
    { q: debouncedQuery || undefined, take: PAGE_SIZE, industryIds: industryIds?.length ? industryIds : undefined },
    { query: { enabled: open, placeholderData: keepPreviousData } },
  );
  const results = React.useMemo(() => (data?.status === 200 ? data.data : []), [data]);

  // Every option this instance has ever seen — search results, a fresh
  // create, or a pre-existing selection from the caller — so a chip's label
  // is always known immediately, without waiting on the next server round
  // trip (a plain click on a search result, or `onCreate` resolving, doesn't
  // change `selectedLabels` until the caller's own mutation refetches).
  // Selected/caller-provided entries seed the map first (name only); live
  // search results are applied after, upgrading an entry with its
  // `industryId` once known.
  const knownById = React.useRef(new Map<string, SpecializationOption>());
  selected.forEach((id, i) => {
    if (selectedLabels[i] && !knownById.current.has(id)) {
      knownById.current.set(id, { id, name: selectedLabels[i] });
    }
  });
  for (const r of results) knownById.current.set(r.id, { id: r.id, name: r.name, industryId: r.industryId });
  const labelFor = React.useCallback((id: string) => knownById.current.get(id)?.name ?? id, []);

  const trimmed = inputValue.trim();
  const hasExactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  const items = React.useMemo(() => {
    const ids = results.map((r) => r.id);
    const withCreate = onCreate && trimmed && !hasExactMatch ? [...ids, CREATE_SENTINEL] : ids;
    // The picker's own item list must include whatever's already selected,
    // even once a search scrolls those results out of view — otherwise
    // base-ui has nothing to render a selected-but-not-currently-fetched
    // id's checked state against (same reasoning as CatalogMultiSelectFilter).
    const idSet = new Set(withCreate);
    return [...withCreate, ...selected.filter((id) => !idSet.has(id))];
  }, [results, selected, onCreate, trimmed, hasExactMatch]);

  function remove(id: string) {
    onChange(selected.filter((v) => v !== id));
  }

  async function handleValueChange(next: string[]) {
    if (next.includes(CREATE_SENTINEL)) {
      const name = trimmed;
      if (!name || !onCreate) return;
      setCreating(true);
      try {
        const created = await onCreate(name);
        knownById.current.set(created.id, created);
        onChange([...selected.filter((v) => v !== CREATE_SENTINEL), created.id]);
        setInputValue('');
      } catch {
        // Caller's own mutation already surfaces the error (toast); just
        // stop treating this as in flight so the user can retry.
      } finally {
        setCreating(false);
      }
      return;
    }
    onChange(next);
  }

  return (
    <Combobox.Root
      items={items}
      filter={null} // server-searched — nothing to filter locally
      multiple
      value={selected}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={labelFor}
      itemToStringValue={(id: string) => id}
      disabled={disabled || creating}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setInputValue('');
      }}
    >
      {/* Same full-cell overlay + relative Trigger split as TagMultiSelect —
          see that component for why. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          // `group-hover`, not `hover` — see TagMultiSelect's own catcher
          // for why (keys off TableCell's `group` so a hover anywhere in
          // the cell, padding included, lights up this one, cell-wide box).
          'absolute inset-0 rounded-md outline-none transition-colors group-hover:bg-accent/50 disabled:pointer-events-none',
          open && 'bg-accent/50',
        )}
      />
      <Combobox.Trigger
        aria-label={selected.length === 0 ? `Add ${title.toLowerCase()}` : undefined}
        className={cn(
          // No background/hover of its own — see TagMultiSelect's Trigger.
          'relative flex min-h-8 w-full max-w-full flex-wrap items-center gap-1 rounded-md border border-transparent px-1 py-0.5 text-left outline-none transition-colors disabled:pointer-events-none disabled:opacity-50',
          selected.length === 0 && 'justify-center',
        )}
      >
        {selected.length === 0 ? (
          <Plus
            aria-hidden
            className="size-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          />
        ) : null}
        {selected.map((id) => (
          <Badge key={id} className={cn('gap-1 rounded-md pr-1 font-normal', colorFor(id))}>
            {labelFor(id)}
            {!disabled ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${labelFor(id)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(id);
                  }
                }}
                className="cursor-pointer rounded-full opacity-70 outline-none hover:opacity-100"
              >
                <X className="size-3" />
              </span>
            ) : null}
          </Badge>
        ))}
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="flex items-center gap-1.5 p-1.5">
              <Combobox.Input
                placeholder="Search specializations…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              {onCreate ? 'No matches — keep typing to add a new value.' : 'No matches.'}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(id: string) => {
                const isCreate = id === CREATE_SENTINEL;
                if (isCreate) {
                  return (
                    <Combobox.Item
                      key={id}
                      value={id}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">Create &quot;{trimmed}&quot;</span>
                    </Combobox.Item>
                  );
                }
                const hasTagMenu = tagActions?.onEdit || tagActions?.onDelete;
                const name = labelFor(id);
                const known = knownById.current.get(id) ?? { id, name };
                return (
                  <Combobox.Item
                    key={id}
                    value={id}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Badge className={cn('rounded-md font-normal', colorFor(id))}>{name}</Badge>
                    {hasTagMenu ? (
                      <span className="ml-auto flex shrink-0 items-center gap-0.5">
                        {tagActions?.onEdit ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Edit ${name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              tagActions.onEdit!(known);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                tagActions.onEdit!(known);
                              }
                            }}
                            className="cursor-pointer rounded-full p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </span>
                        ) : null}
                        {tagActions?.onDelete ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Delete ${name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              tagActions.onDelete!(known);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                tagActions.onDelete!(known);
                              }
                            }}
                            className="cursor-pointer rounded-full p-1 text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </span>
                        ) : null}
                      </span>
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

/**
 * Compact icon-button variant for a `DataGridFilter` header slot — same
 * server-searched shape as `LocationFilterButton`/`ConsultantFilterButton`.
 * No `industryIds` narrowing (a page-level filter isn't scoped to one row's
 * held industries) and no create — filtering never grows the catalog.
 */
export function SpecializationFilterButton({
  selected,
  onChange,
  onResolve,
  title = 'Specialization',
  compact = true,
  placeholder,
  labelFor,
  industryIds,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Fires whenever a specialization's name becomes known from a search result, so the caller can cache id -> name for display elsewhere (e.g. the "Filters applied" chip row). */
  onResolve?: (id: string, name: string) => void;
  title?: string;
  /** Icon-only trigger (default) for a `DataGridFilter` header slot, vs a full dashed-pill dropdown field for an action-bar filter row. */
  compact?: boolean;
  /** Trigger label/placeholder text when `compact` is false. */
  placeholder?: string;
  /** Resolves an already-selected id to a display name when it's not in the current search results. Only used when `compact` is false. */
  labelFor?: (id: string) => string;
  /** Narrows results to specializations under these industries (OR). Omit/empty for an unrestricted search. */
  industryIds?: string[];
}) {
  const [inputValue, setInputValue] = React.useState('');
  const debouncedQuery = useDebounced(inputValue, DEBOUNCE_MS);
  const [open, setOpen] = React.useState(false);

  const { data, isFetching } = useGetSpecializations(
    { q: debouncedQuery || undefined, take: PAGE_SIZE, industryIds: industryIds?.length ? industryIds : undefined },
    { query: { enabled: open, placeholderData: keepPreviousData } },
  );
  const results = React.useMemo(() => (data?.status === 200 ? data.data : []), [data]);
  const resultsById = React.useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);
  // Selected ids not in the current search results still need to render as a
  // checked row — otherwise a selection made from a different query (or
  // before the popup was ever opened) is invisible once the user reopens it.
  const items = React.useMemo(() => {
    const ids = results.map((r) => r.id);
    const idSet = new Set(ids);
    return [...ids, ...selected.filter((id) => !idSet.has(id))];
  }, [results, selected]);

  React.useEffect(() => {
    if (!onResolve) return;
    for (const r of results) onResolve(r.id, r.name);
  }, [results, onResolve]);

  const resolveLabel = (id: string) => resultsById.get(id)?.name ?? labelFor?.(id) ?? id;

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
      open={open}
      onOpenChange={setOpen}
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
          <span className={cn('min-w-0 flex-1 truncate text-left', selected.length === 0 && 'text-muted-foreground')}>
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
                placeholder="Search specializations…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              No matches.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(id: string) => {
                const spec = resultsById.get(id);
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
                    <span className="min-w-0 flex-1 truncate">{spec?.name ?? labelFor?.(id) ?? id}</span>
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

/** Static, non-interactive chips for a read-only Specializations cell — no catalog fetch needed, `ids`/`names` come straight off the record. Colored by id, same as the editable picker's chips. */
export function SpecializationBadgeList({ ids, names }: { ids: string[]; names: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id, i) => (
        <Badge key={id} className={cn('rounded-md font-normal', colorFor(id))}>
          {names[i] ?? id}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Single-select, server-searched Specialization field with inline create —
 * the Specialization sibling of `CreatableCombobox`, kept as its own
 * component rather than a mode on that shared one: `CreatableCombobox` is
 * used for a dozen small, genuinely-eager catalogs (Industry, JobTitle, role
 * types...) where full-list + client filter is the right call, and giving it
 * a second, server-searched code path for this one caller would make it
 * harder to reason about for everyone else. `industryId` narrows results
 * (a Specialization belongs to exactly one Industry); pass `undefined` to
 * search unrestricted (e.g. picking a parent category inside an industry
 * that's already fixed by the caller — see CreateSpecializationDialog).
 */
export function SpecializationCombobox({
  id,
  value,
  label,
  onValueChange,
  industryId,
  onCreate,
  placeholder = 'Search or add new…',
  disabled = false,
  clearable = false,
}: {
  id?: string;
  /** Selected specialization's id — '' for none. */
  value: string;
  /** Selected specialization's name, if known (e.g. from the record being edited) — shown on the trigger until the popup's own search resolves it fresh. */
  label?: string;
  onValueChange: (id: string) => void;
  industryId?: string;
  /** Omit to disable inline creation (e.g. the parent-category picker, which is already inside a create flow). */
  onCreate?: (name: string) => Promise<SpecializationOption>;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const debouncedQuery = useDebounced(inputValue, DEBOUNCE_MS);
  const [creating, setCreating] = React.useState(false);
  const knownById = React.useRef(new Map<string, string>());
  if (value && label) knownById.current.set(value, label);

  const { data, isFetching } = useGetSpecializations(
    { q: debouncedQuery || undefined, take: PAGE_SIZE, industryIds: industryId ? [industryId] : undefined },
    { query: { enabled: open, placeholderData: keepPreviousData } },
  );
  const results = React.useMemo(() => (data?.status === 200 ? data.data : []), [data]);
  for (const r of results) knownById.current.set(r.id, r.name);
  const currentLabel = value ? (knownById.current.get(value) ?? label ?? '') : '';

  const trimmed = inputValue.trim();
  const hasExactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  const items = React.useMemo(() => {
    const ids = results.map((r) => r.id);
    return onCreate && trimmed && !hasExactMatch ? [...ids, CREATE_SENTINEL] : ids;
  }, [results, onCreate, trimmed, hasExactMatch]);

  async function handleSelect(itemId: string | null) {
    if (itemId === null) return;
    if (itemId === CREATE_SENTINEL) {
      const name = trimmed;
      if (!name || !onCreate) return;
      setCreating(true);
      try {
        const created = await onCreate(name);
        knownById.current.set(created.id, created.name);
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
      filter={null}
      value={value}
      onValueChange={handleSelect}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringValue={(itemId: string) => itemId}
      disabled={disabled || creating}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setInputValue('');
      }}
    >
      <Combobox.Trigger
        id={id}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', !currentLabel && 'text-muted-foreground')}>
          {currentLabel || placeholder}
        </span>
        {clearable && value ? (
          // role="button", not a nested <button> — sits inside Combobox.Trigger's
          // own <button>; see CreatableCombobox's identical pattern for why.
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear"
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

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="flex items-center gap-1.5 p-1.5">
              <Combobox.Input
                placeholder="Search or add new…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              {onCreate ? 'No matches — keep typing to add a new value.' : 'No matches.'}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(itemId: string) => {
                const isCreate = itemId === CREATE_SENTINEL;
                return (
                  <Combobox.Item
                    key={itemId}
                    value={itemId}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {isCreate ? <Plus className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    <span className="min-w-0 flex-1 truncate">
                      {isCreate ? `Add "${trimmed}"` : (knownById.current.get(itemId) ?? itemId)}
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
