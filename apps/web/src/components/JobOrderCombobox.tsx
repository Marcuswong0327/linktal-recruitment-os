'use client';

import { useMemo, useCallback } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';
import type { JobOrderEntity } from '@/lib/api/generated/types';

/** Shared lookup + display helpers for any Combobox picking a job order. */
export function useJobOrderLookup(jobOrders: JobOrderEntity[]) {
  const byId = useMemo(() => new Map(jobOrders.map((j) => [j.id, j])), [jobOrders]);
  const items = useMemo(() => jobOrders.map((j) => j.id), [jobOrders]);

  const labelFor = useCallback((jobOrderId: string) => byId.get(jobOrderId)?.jobTitle ?? 'Unknown', [byId]);
  // Drives filtering — combine title + displayId so typing either finds the match.
  const searchTextFor = useCallback(
    (jobOrderId: string) => {
      const jobOrder = byId.get(jobOrderId);
      return jobOrder ? `${jobOrder.jobTitle} ${jobOrder.displayId}` : jobOrderId;
    },
    [byId],
  );

  return { byId, items, labelFor, searchTextFor };
}

interface JobOrderComboboxProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  jobOrders: JobOrderEntity[];
  disabled?: boolean;
  className?: string;
}

/** Searchable job order picker — same reasoning as ClientCombobox/ConsultantCombobox. */
export function JobOrderCombobox({ id, value, onValueChange, jobOrders, disabled, className }: JobOrderComboboxProps) {
  const { byId, items, labelFor, searchTextFor } = useJobOrderLookup(jobOrders);

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next) => next != null && onValueChange(next)}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(jobOrderId) => jobOrderId}
      disabled={disabled}
    >
      <Combobox.Trigger
        id={id}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-muted-foreground')}>
          <Combobox.Value>{() => (value ? labelFor(value) : 'Select a job order')}</Combobox.Value>
        </span>
        <Combobox.Icon className="text-muted-foreground">
          <ChevronDown className="pointer-events-none size-4 shrink-0" />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder="Search job orders…"
                {...noBrowserAutofill}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
              No job orders found.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
              {(jobOrderId: string) => {
                const jobOrder = byId.get(jobOrderId);
                return (
                  <Combobox.Item
                    key={jobOrderId}
                    value={jobOrderId}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{labelFor(jobOrderId)}</span>
                      {jobOrder?.displayId ? (
                        <span className="truncate text-xs text-muted-foreground">{jobOrder.displayId}</span>
                      ) : null}
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
