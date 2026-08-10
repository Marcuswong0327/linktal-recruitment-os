'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getSpecialization, useGetSpecializations } from '@/lib/api/generated/specializations/specializations';

/**
 * Searchable, server-driven multi-select for Specialization (775+ rows,
 * growing). `GET /specializations` now accepts `q`/`take` for exactly this
 * — a debounced query per keystroke instead of downloading the whole
 * catalog (~230KB) up front just to filter it in the browser. With nothing
 * typed yet it shows a first page (50) rather than everything, same as the
 * Role Type/Location pickers.
 *
 * Name resolution is lifted to the caller (`labelFor`/`registerLabel`,
 * same contract as LocationFilter) rather than cached locally — the parent
 * also needs specialization names for the Active Filters chips, and without
 * sharing this cache it would have to preload the full catalog itself just
 * for that, undoing the point of not loading everything up front.
 */
export function CatalogMultiSelectFilter({
  title,
  selected,
  onChange,
  labelFor,
  registerLabel,
}: {
  title: string;
  selected: string[];
  onChange: (values: string[]) => void;
  /** Resolves an already-selected id to a display name — falls back to whatever this component (or a sibling using the same cache) has resolved so far. */
  labelFor: (id: string) => string;
  /** Called whenever this component resolves an id -> name, so the caller can cache it (e.g. for chip labels) without a second lookup. */
  registerLabel: (id: string, name: string) => void;
}) {
  const [inputValue, setInputValue] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(inputValue.trim()), 200);
    return () => clearTimeout(t);
  }, [inputValue]);

  const { data } = useGetSpecializations({ q: debounced || undefined, take: 50 }, { query: { enabled: open } });
  const results = React.useMemo(() => (data?.status === 200 ? data.data : []), [data]);
  const byId = React.useMemo(() => new Map(results.map((o) => [o.id, o.name])), [results]);

  React.useEffect(() => {
    results.forEach((o) => registerLabel(o.id, o.name));
  }, [results, registerLabel]);

  // A selected id not covered by the current search results (e.g. restored
  // from a bookmarked search URL, before any search has run in this
  // component instance) gets resolved directly by id.
  React.useEffect(() => {
    const unresolved = selected.filter((id) => labelFor(id) === id);
    if (unresolved.length === 0) return;
    let cancelled = false;
    Promise.all(unresolved.map((id) => getSpecialization(id))).then((responses) => {
      if (cancelled) return;
      responses.forEach((res) => {
        if (res.status === 200) registerLabel(res.data.id, res.data.name);
      });
    });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on `selected` alone — see LocationFilter's
    // identical pattern for why `labelFor`/`registerLabel` aren't deps here.
  }, [selected]);

  // The picker's own item list must include whatever's already selected,
  // even once a search scrolls those results out of view — otherwise
  // base-ui has nothing to render a selected-but-not-currently-fetched id's
  // checked state against.
  const items = React.useMemo(() => {
    const ids = new Set(results.map((o) => o.id));
    return [...results.map((o) => o.id), ...selected.filter((id) => !ids.has(id))];
  }, [results, selected]);

  function remove(id: string) {
    onChange(selected.filter((v) => v !== id));
  }

  return (
    <Combobox.Root
      items={items}
      multiple
      value={selected}
      onValueChange={onChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={labelFor}
      itemToStringValue={(id) => id}
      open={open}
      onOpenChange={setOpen}
    >
      <Combobox.Trigger className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-left text-sm outline-none transition-[color,box-shadow] duration-200 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30">
        {selected.length === 0 ? (
          <span className="text-muted-foreground">{title}…</span>
        ) : (
          selected.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 rounded-md font-normal">
              {labelFor(id)}
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
                className="cursor-pointer opacity-70 hover:opacity-100"
              >
                ×
              </span>
            </Badge>
          ))
        )}
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder={`Search ${title.toLowerCase()}…`}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Separator />
            <div className="bg-black/5 dark:bg-black/20">
              <Combobox.Empty className="text-sm text-muted-foreground">
                <p className="px-3 py-3 text-center">No matches.</p>
              </Combobox.Empty>
              <Combobox.List className="max-h-64 overflow-y-auto p-1">
                {(id: string) => {
                  const name = byId.get(id);
                  return (
                    <Combobox.Item
                      key={id}
                      value={id}
                      className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <span className={cn('min-w-0 flex-1 truncate', !name && 'text-muted-foreground')}>
                        {name ?? labelFor(id)}
                      </span>
                      <Combobox.ItemIndicator className="shrink-0">
                        <Check className="size-4" />
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
