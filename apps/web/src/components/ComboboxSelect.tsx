'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export interface ComboboxSelectOption {
  value: string;
  label: string;
  /** Badge classes for this option's pill, wherever it's shown selected. */
  triggerClassName?: string;
}

interface ComboboxSelectProps {
  title: string;
  options: ComboboxSelectOption[];
  /** Empty string means unset. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

/**
 * Single-select counterpart to TagMultiSelect — same shape (full-cell click
 * target via an absolute overlay, search box, separator, catalog), but one
 * value instead of many: picking an option replaces the current value and
 * closes the popup immediately (base-ui's own single-select behavior), no
 * removable chip list needed.
 */
export function ComboboxSelect({
  title,
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  disabled = false,
  triggerClassName,
}: ComboboxSelectProps) {
  const byId = React.useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const items = React.useMemo(() => options.map((o) => o.value), [options]);
  const [open, setOpen] = React.useState(false);
  const current = byId.get(value);

  return (
    <Combobox.Root
      items={items}
      value={value || null}
      onValueChange={(next) => onValueChange(next ?? '')}
      itemToStringLabel={(v) => byId.get(v)?.label ?? v}
      itemToStringValue={(v) => v}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
    >
      {/* Same full-cell overlay pattern as TagMultiSelect — see that
          component for why this needs to be absolute against TableCell
          rather than sized via the trigger's own box. */}
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
        aria-label={`Change ${title.toLowerCase()}`}
        className={cn(
          'relative inline-flex max-w-full items-center gap-1 rounded-md border border-transparent px-1 py-0.5 text-left outline-none transition-colors hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50',
          triggerClassName,
        )}
      >
        <Badge className={cn('rounded-md font-normal', current?.triggerClassName)}>
          {current?.label ?? placeholder}
        </Badge>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-56 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder="Search for an option…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Separator />
            <div className="bg-black/5 dark:bg-black/20">
              <Combobox.Empty className="text-sm text-muted-foreground empty:hidden">
                <p className="px-3 py-3 text-center">No matches.</p>
              </Combobox.Empty>
              <Combobox.List className="max-h-64 overflow-y-auto p-1">
                {(v: string) => {
                  const option = byId.get(v);
                  return (
                    <Combobox.Item
                      key={v}
                      value={v}
                      className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <Badge className={cn('rounded-md font-normal', option?.triggerClassName)}>
                        {option?.label ?? v}
                      </Badge>
                      <Combobox.ItemIndicator className="ml-auto shrink-0">
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
