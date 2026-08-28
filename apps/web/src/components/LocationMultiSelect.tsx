'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { keepPreviousData } from '@tanstack/react-query';
import { Check, ChevronDown, ListFilter, Loader2, Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGetLocations } from '@/lib/api/generated/locations/locations';
import type { LocationEntity } from '@/lib/api/generated/types';
import { LocationEntityLevel } from '@/lib/api/generated/types/locationEntityLevel';

export interface LocationOption {
  id: string;
  name: string;
  /**
   * Absent for pills seeded from an entity's resolved location names (e.g.
   * Stakeholder.coverage, Client.locations — name-only, the API doesn't
   * return level alongside them), present for anything picked during this
   * session (straight from a live search result). The badge is simply
   * omitted when unknown, rather than issuing a per-id lookup to backfill it.
   */
  level?: LocationEntity['level'];
}

export const LEVEL_LABEL: Record<LocationEntity['level'], string> = {
  [LocationEntityLevel.COUNTRY]: 'Country',
  [LocationEntityLevel.STATE]: 'State',
  [LocationEntityLevel.CITY]: 'City',
  [LocationEntityLevel.SUBURB]: 'Suburb',
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

interface LocationMultiSelectProps {
  id?: string;
  selected: LocationOption[];
  onChange: (next: LocationOption[]) => void;
  disabled?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  /**
   * Drops the always-on `bg-input/50` field chrome in favor of a
   * hover-only background, matching `TagMultiSelect`'s trigger — for a
   * table-cell column (e.g. Consultants' Locations) sitting next to
   * `TagMultiSelect`-backed columns (Industries, Specializations), where
   * the badges should read the same way: sitting directly on the cell,
   * not boxed in a second, always-visible pill. Leave off (default) for
   * standalone form fields, where a visible field boundary matching
   * `LocationCombobox`/`ConsultantCombobox` is the intent.
   */
  bare?: boolean;
}

/**
 * Search-as-you-type multi-select over the Location catalog (COUNTRY ▸
 * STATE ▸ CITY ▸ SUBURB, bulk-loaded from GeoNames — ~2k nodes and growing).
 * Unlike `TagMultiSelect` (a small in-memory catalog filtered client-side),
 * this queries `GET /locations?q=` per keystroke (debounced) since the tree
 * is too large to fetch in full — same reasoning as `ClientCombobox`, but
 * server-searched rather than server-fetched-once. No "browse" affordance
 * and no inline create (Location is admin-only, never hand-typed — see
 * `locations.controller.ts`).
 */
export function LocationMultiSelect({
  id,
  selected,
  onChange,
  disabled = false,
  placeholder = 'Search locations…',
  triggerClassName,
  bare = false,
}: LocationMultiSelectProps) {
  // Tracked only for the click-catcher's own `bg-accent/50` hover-alike
  // styling below — not passed to Combobox.Root as a controlled `open` (see
  // triggerRef below for why).
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
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
  const selectedIds = React.useMemo(() => selected.map((s) => s.id), [selected]);
  const items = React.useMemo(() => results.map((r) => r.id), [results]);

  function remove(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  function handleValueChange(next: string[]) {
    const nextSet = new Set(next);
    const kept = selected.filter((s) => nextSet.has(s.id));
    const addedIds = next.filter((valueId) => !selectedIds.includes(valueId));
    const added: LocationOption[] = addedIds
      .map((valueId) => resultsById.get(valueId))
      .filter((r): r is LocationEntity => r != null)
      .map((r) => ({ id: r.id, name: r.name, level: r.level }));
    onChange([...kept, ...added]);
  }

  return (
    <Combobox.Root
      items={items}
      filter={null} // server-searched — nothing to filter locally
      multiple
      value={selectedIds}
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
      {/* `relative` wrapper owned by this component (not the caller) — the
          catcher below is `absolute inset-0` and needs a same-size positioned
          ancestor to size against. Without one, `inset-0` falls back to the
          nearest positioned ancestor up the tree, which outside a
          (`relative`) TableCell is easily the whole page shell
          (`SidebarInset`), ballooning the invisible hover/click target over
          everything below it. `bare` skips it deliberately instead: it's
          only ever used inside a DataGrid cell, whose own TableCell is both
          `relative` *and* the nearby, correctly-sized ancestor this would
          otherwise recreate — going straight to it (rather than this div's
          own, TableCell-padding-excluded box) is what lets the catcher
          below reach the cell's true, padding-included edges. */}
      <div className={cn(!bare && 'relative')}>
        {/* Same full-cell overlay pattern as TagMultiSelect/ComboboxSelect —
            clicking anywhere in the field's empty space (not just directly on
            the trigger's own shrink-wrapped box) opens the picker. Trigger is
            a real <button> internally, so it can't wrap another one; this
            catcher instead sits *behind* it (earlier in the DOM), giving the
            whole field a click target while a chip's own X (inside Trigger)
            still gets first claim. Opens by dispatching a real click on the
            Trigger itself (via triggerRef) rather than a controlled `open`
            prop on Combobox.Root — controlling `open` from here used to also
            leave it controlled for every other interaction (typing,
            selecting, Escape), and that extra React-state round-trip landed
            one render behind Base UI's own position sync, flashing the popup
            at a stale position on first open. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onClick={() => triggerRef.current?.click()}
          className={cn(
            'absolute inset-0 rounded-2xl outline-none transition-colors disabled:pointer-events-none',
            !disabled &&
              // `group-hover` (keys off TableCell's own `group`, so hovering
              // anywhere in the cell — its padding included — lights up
              // this single, edge-to-edge box) for `bare`; plain `hover` for
              // a standalone form field, which has no such ancestor.
              (bare ? 'group-hover:bg-accent/50' : 'hover:bg-accent/50'),
            open && 'bg-accent/50',
          )}
        />
        <Combobox.Trigger
          ref={triggerRef}
          id={id}
          aria-label={selected.length === 0 ? placeholder : undefined}
          className={cn(
            'relative flex min-h-9 w-full flex-wrap items-center gap-1 rounded-2xl border border-transparent px-2 py-1.5 text-left outline-none transition-colors disabled:pointer-events-none disabled:opacity-50',
            // No background/hover of its own in `bare` mode — the catcher
            // above is the only highlight (see its own comment). A
            // standalone form field keeps its persistent `bg-input/50`.
            !bare && 'bg-input/50',
            // Centers the `+` (below) dead in the cell — only while empty;
            // populated badges stay left-aligned/wrapped as usual.
            bare && selected.length === 0 && 'justify-center',
            triggerClassName,
          )}
        >
          {selected.length === 0 ? (
            bare ? (
              <Plus
                aria-hidden
                className="size-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
              />
            ) : (
              <span className="pointer-events-none text-sm text-muted-foreground">{placeholder}</span>
            )
          ) : (
            selected.map((option) => (
              // text-sm, not Badge's own text-xs default — matches the
              // placeholder's own size (see the `span` above) so an empty
              // vs. populated trigger doesn't visibly change type size.
              <Badge key={option.id} className="gap-1 rounded-md pr-1 text-sm font-normal">
                {option.name}
                {option.level ? (
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    {LEVEL_LABEL[option.level]}
                  </span>
                ) : null}
                {!disabled ? (
                  // role="button" (not a nested <button>) — this sits inside
                  // Combobox.Trigger's own <button>, and nested interactive
                  // elements break hydration (same reasoning as TagMultiSelect).
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${option.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(option.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(option.id);
                      }
                    }}
                    className="cursor-pointer rounded-full opacity-70 outline-none hover:opacity-100"
                  >
                    <X className="size-3" />
                  </span>
                ) : null}
              </Badge>
            ))
          )}
        </Combobox.Trigger>
      </div>

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

export interface LocationFilterButtonProps {
  /** Currently selected location ids. */
  selected: string[];
  onChange: (ids: string[]) => void;
  /**
   * Fires whenever a location's name/level become known from a search
   * result — so the caller can cache id→{name,level} for display elsewhere
   * (e.g. a "Filters applied" summary chip), since this button only ever
   * renders an icon itself.
   */
  onResolve?: (id: string, name: string, level: LocationEntity['level']) => void;
  title?: string;
  /** Narrows the search to one rung of the tree (e.g. only countries, only cities) — omit to search across all levels. */
  level?: LocationEntity['level'];
  /**
   * Loads a default list (`level` + empty query) instead of requiring
   * `MIN_QUERY_LENGTH` characters first — sane for a small, browsable rung
   * like Country; leave off for a huge one like City, which must be typed.
   */
  browsable?: boolean;
  /** Icon-only trigger (default) for a `DataGridFilter` header slot, vs a full dashed-pill dropdown field for an action-bar filter row. */
  compact?: boolean;
  /** Trigger label/placeholder text when `compact` is false. */
  placeholder?: string;
  /** Resolves an already-selected id to a display name when it's not in the current search results — same reasoning as `LocationFilter`'s `labelFor`. Only used when `compact` is false. */
  labelFor?: (id: string) => string;
  /** Narrows results to nodes at or beneath this location (e.g. a selected Country), same as the API's `underId`. Omit for an unrestricted search. */
  underId?: string;
}

/**
 * Server-searched multi-select over the Location catalog. Defaults to a
 * compact icon-button variant of `LocationMultiSelect` for a `DataGridFilter`
 * header slot; set `compact={false}` for a full dashed-pill dropdown field
 * (an action-bar filter row), optionally scoped to one `level`.
 */
export function LocationFilterButton({
  selected,
  onChange,
  onResolve,
  title = 'Location',
  level,
  browsable = false,
  compact = true,
  placeholder,
  labelFor,
  underId,
}: LocationFilterButtonProps) {
  const [inputValue, setInputValue] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const searchEnabled = browsable || debouncedQuery.length >= MIN_QUERY_LENGTH;
  const { data, isFetching } = useGetLocations(
    { q: debouncedQuery || undefined, level, underId, take: 20 },
    { query: { enabled: searchEnabled, placeholderData: keepPreviousData } },
  );
  const results: LocationEntity[] = searchEnabled && data?.status === 200 ? data.data : [];
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
    for (const r of results) onResolve(r.id, r.name, r.level);
  }, [results, onResolve]);

  const resolveLabel = (id: string) => resultsById.get(id)?.name ?? labelFor?.(id) ?? id;

  return (
    <Combobox.Root
      items={items}
      filter={null} // server-searched — nothing to filter locally
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
                placeholder="Search for a place…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              {isFetching ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              {!searchEnabled ? 'Type at least 2 characters to search.' : 'No locations found.'}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(id: string) => {
                const location = resultsById.get(id);
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
                    <span className="min-w-0 flex-1 truncate">{location?.name ?? labelFor?.(id) ?? id}</span>
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
