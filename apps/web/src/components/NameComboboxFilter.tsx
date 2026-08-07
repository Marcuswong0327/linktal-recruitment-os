'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface NameComboboxFilterProps {
  title: string;
  /** Selected option name, or undefined for no filter. */
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
  /** Rows to search/pick from — only `name` is used, since the filter matches on name text. */
  options: { id: string; name: string }[];
}

/**
 * DataGrid toolbar filter for a free-text, user-extensible lookup list
 * (industry, specialization, …) — a searchable combobox rather than
 * `DataGridFacetedFilter`'s plain checkbox list, since these rosters grow
 * unbounded via `CreatableCombobox` and a static list doesn't scale.
 */
export function NameComboboxFilter({ title, value, onValueChange, options }: NameComboboxFilterProps) {
  const items = React.useMemo(() => options.map((o) => o.name), [options]);
  const hasValue = value !== undefined;

  return (
    <Combobox.Root items={items} value={value ?? null} onValueChange={(next) => onValueChange(next ?? undefined)}>
      <Combobox.Trigger
        render={
          <Button
            variant="outline"
            className={cn(
              'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              hasValue && 'border-solid',
            )}
          />
        }
      >
        {title}
        {hasValue ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Badge variant="muted" className="rounded-sm px-1 font-normal">
              {value}
            </Badge>
          </>
        ) : null}
        <ChevronDown className="opacity-50" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-64 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder={`Search ${title.toLowerCase()}…`}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              No matches.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
              {(name: string) => (
                <Combobox.Item
                  key={name}
                  value={name}
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <Combobox.ItemIndicator className="shrink-0">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {hasValue ? (
              <>
                <Separator />
                <button
                  type="button"
                  onClick={() => onValueChange(undefined)}
                  className="w-full px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Clear
                </button>
              </>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
