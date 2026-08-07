'use client';

import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ConsultantEntity } from '@/lib/api/generated/types';

/** Single-select "who did this" filter — the API's actorId is one id, not a list, so this is its own small component rather than reusing the multi-select catalog pickers. */
export function ActorFilter({
  consultants,
  value,
  onValueChange,
}: {
  consultants: ConsultantEntity[];
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
}) {
  const items = consultants.map((c) => c.id);
  const byId = new Map(consultants.map((c) => [c.id, c]));

  return (
    <Combobox.Root
      items={items}
      value={value ?? null}
      onValueChange={(next) => onValueChange(next ?? undefined)}
      itemToStringLabel={(id) => byId.get(id)?.fullName ?? id}
      itemToStringValue={(id) => id}
    >
      <Combobox.Trigger
        render={
          <Button
            variant="outline"
            className={cn(
              'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              value && 'border-solid',
            )}
          />
        }
      >
        Actor
        {value ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <span className="text-xs">{byId.get(value)?.fullName ?? value}</span>
          </>
        ) : null}
        <ChevronDown className="opacity-50" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-64 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder="Search consultants…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground">
              No consultants found.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
              {(id: string) => (
                <Combobox.Item
                  key={id}
                  value={id}
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{byId.get(id)?.fullName ?? id}</span>
                  <Combobox.ItemIndicator className="shrink-0">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {value ? (
              <button
                type="button"
                onClick={() => onValueChange(undefined)}
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
