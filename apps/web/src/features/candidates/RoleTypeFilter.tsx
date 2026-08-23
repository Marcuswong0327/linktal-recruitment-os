'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { JobRoleTypeFacetEntity } from '@/lib/api/generated/types';

/**
 * The primary search filter — Role Type is filled on 99.4% of candidates
 * (every other classifier — Industry at 3 distinct values, Specialization at
 * 5% tagged — barely narrows anything on this dataset; see
 * candidate-data-fill-rates in project memory). Each option shows how many
 * *currently filtered* candidates carry it ("Fitter (793)"), computed
 * server-side by `GET /candidates/facets/job-role-types` with every other
 * active filter applied — so the counts answer "if I also picked this",
 * not a static catalog count.
 *
 * `facets` is fetched once by the parent (also needed there to resolve
 * Active Filters chip labels — the plain `/job-role-types` catalog is
 * paginated at 50 by design, so it can't be trusted to contain an arbitrary
 * selected id; facets, an unbounded `groupBy`, always can as long as it has
 * at least one current match).
 *
 * The list only renders once the user has typed at least `MIN_QUERY_LENGTH`
 * characters — same "must type to browse" behavior as the City filter
 * (`LocationFilterButton` with `browsable` off), rather than dumping the
 * full (possibly 200+) facet list open on click.
 */
const MIN_QUERY_LENGTH = 2;

export function RoleTypeFilter({
  selected,
  onChange,
  facets,
  labelFor,
}: {
  selected: string[];
  onChange: (values: string[]) => void;
  facets: JobRoleTypeFacetEntity[];
  /** Resolves an id already selected but with zero current matches (so absent from `facets`) — falls back so the trigger never shows a raw id. */
  labelFor: (id: string) => string;
}) {
  const [inputValue, setInputValue] = React.useState('');
  const searchEnabled = inputValue.trim().length >= MIN_QUERY_LENGTH;

  const byId = React.useMemo(() => new Map(facets.map((f) => [f.id, f])), [facets]);
  const items = React.useMemo(() => {
    const visible = searchEnabled ? facets.map((f) => f.id) : [];
    // Selected-but-not-in-current-facets (a filter combo that's since
    // narrowed this option to zero) still needs to render as a checked row —
    // appended after the visible facets, in selection order, regardless of
    // whether the list is currently gated behind typing.
    const ids = new Set(visible);
    return [...visible, ...selected.filter((id) => !ids.has(id))];
  }, [facets, selected, searchEnabled]);

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
    >
      <Combobox.Trigger className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-2xl border border-input bg-input/50 px-3 py-2 text-left text-sm outline-none transition-[color,box-shadow] duration-200 hover:bg-input/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30">
        {selected.length === 0 ? (
          <span className="text-muted-foreground">Any role type…</span>
        ) : (
          selected.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 rounded-md font-normal">
              {byId.get(id)?.name ?? labelFor(id)}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${byId.get(id)?.name ?? labelFor(id)}`}
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
                placeholder="Search role types…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground">
              {!searchEnabled ? 'Type at least 2 characters to search.' : 'No role types match the current filters.'}
            </Combobox.Empty>
            <Combobox.List className="max-h-72 overflow-y-auto p-1 pt-0">
              {(id: string) => {
                const facet = byId.get(id);
                return (
                  <Combobox.Item
                    key={id}
                    value={id}
                    className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className={cn('min-w-0 flex-1 truncate', !facet && 'text-muted-foreground')}>
                      {facet?.name ?? labelFor(id)}
                    </span>
                    {facet ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{facet.count.toLocaleString()}</span>
                    ) : null}
                    <Combobox.ItemIndicator className="shrink-0">
                      <Check className="size-4" />
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
