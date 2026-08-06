'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getLocation, useGetLocations } from '@/lib/api/generated/locations/locations';

/**
 * Hierarchical location picker for the candidate search — replaces a plain
 * text box that only ever matched a candidate's own node name (typing
 * "Australia" found nobody, because every Australian candidate is stored at
 * CITY level). Sends `locationIds`, matched server-side through the location
 * tree's `ancestorIds`, so picking a country or state correctly pulls in
 * everything beneath it.
 *
 * Options are server-searched (the tree is ~2k nodes, capped at 200 per
 * request) rather than preloaded — `inputValue` drives a debounced
 * `GET /locations?q=`, and with nothing typed yet it shows the top-level
 * countries as a sane default list to browse.
 */
export function LocationFilter({
  selected,
  onChange,
  labelFor,
  registerLabel,
}: {
  selected: string[];
  onChange: (values: string[]) => void;
  /** Resolves an already-selected id to a display name (e.g. for chip labels elsewhere) — falls back to whatever this component has seen. */
  labelFor: (id: string) => string;
  /** Called whenever this component resolves an id -> name, so the caller can cache it for chip labels without a second lookup. */
  registerLabel: (id: string, name: string) => void;
}) {
  const [inputValue, setInputValue] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(inputValue.trim()), 200);
    return () => clearTimeout(t);
  }, [inputValue]);

  const { data } = useGetLocations(
    debounced ? { q: debounced, take: 50 } : { level: 'COUNTRY', take: 50 },
    { query: { enabled: open } },
  );
  const results = data?.status === 200 ? data.data : [];

  React.useEffect(() => {
    results.forEach((l) => registerLabel(l.id, l.name));
  }, [results, registerLabel]);

  // The picker's own item list must always include whatever's already
  // selected (even once the search text scrolls those results out of view)
  // — otherwise base-ui has nothing to render a selected-but-not-currently-
  // fetched id's checked state against.
  const items = React.useMemo(() => {
    const ids = new Set(results.map((l) => l.id));
    return [...results.map((l) => l.id), ...selected.filter((id) => !ids.has(id))];
  }, [results, selected]);

  const byId = React.useMemo(() => new Map(results.map((l) => [l.id, l])), [results]);

  // A location selected via a bookmarked/shared search URL (see
  // useCandidateSearch's URL persistence) is just a bare id on first
  // paint — nothing has fetched its name yet, and it may never appear in
  // `results` if the user doesn't happen to search for it. Resolve it
  // directly by id so the trigger/chips show a real name, not a raw cuid.
  // `labelFor(id) === id` is the "still unresolved" signal (see the
  // resolver's own fallback in CandidateSearchGate).
  React.useEffect(() => {
    const unresolved = selected.filter((id) => labelFor(id) === id);
    if (unresolved.length === 0) return;
    let cancelled = false;
    Promise.all(unresolved.map((id) => getLocation(id))).then((responses) => {
      if (cancelled) return;
      responses.forEach((res) => {
        if (res.status === 200) registerLabel(res.data.id, res.data.name);
      });
    });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on `selected` alone — `labelFor`/`registerLabel`
    // change identity as names resolve, and re-running on those would just
    // refetch what this effect itself just resolved.
  }, [selected]);

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
      itemToStringLabel={(id) => byId.get(id)?.name ?? labelFor(id)}
      itemToStringValue={(id) => id}
      open={open}
      onOpenChange={setOpen}
    >
      <Combobox.Trigger
        render={
          <Button
            variant="outline"
            className={cn(
              'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              selected.length > 0 && 'border-solid',
            )}
          />
        }
      >
        <MapPin className="opacity-60" />
        Location
        {selected.length > 0 ? (
          <span className="flex items-center gap-1">
            <span className="mx-0.5 h-4 w-px bg-border" />
            {selected.slice(0, 2).map((id) => (
              <Badge key={id} variant="muted" className="gap-1 rounded-sm px-1 font-normal">
                {labelFor(id)}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${labelFor(id)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(id);
                  }}
                  className="cursor-pointer opacity-70 hover:opacity-100"
                >
                  ×
                </span>
              </Badge>
            ))}
            {selected.length > 2 ? (
              <Badge variant="muted" className="rounded-sm px-1 font-normal">
                +{selected.length - 2}
              </Badge>
            ) : null}
          </span>
        ) : null}
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder="Search country, state, city…"
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
                  const location = byId.get(id);
                  return (
                    <Combobox.Item
                      key={id}
                      value={id}
                      className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate">{location?.name ?? labelFor(id)}</span>
                      {location ? (
                        <span className="shrink-0 text-xs text-muted-foreground capitalize">
                          {location.level.toLowerCase()}
                        </span>
                      ) : null}
                      <Combobox.ItemIndicator className="shrink-0">
                        <Check className="size-4" />
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </div>
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full border-t border-border px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Clear
              </button>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
