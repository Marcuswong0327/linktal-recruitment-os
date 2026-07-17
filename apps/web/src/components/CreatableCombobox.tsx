'use client';

import { Combobox } from '@base-ui/react/combobox';
import { Check, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CreatableComboboxProps {
  id?: string;
  /** Plain text — there's no separate lookup table, this is always just what gets saved on the record. */
  value: string;
  onValueChange: (value: string) => void;
  /** Existing distinct values already in use elsewhere, offered as quick picks. */
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Free-text field with a searchable dropdown of previously-used values.
 * Typing is always a valid value on its own (this isn't a fixed enum) — the
 * dropdown exists so a recruiter can reuse an existing entry (e.g.
 * "Logistics") with one click instead of retyping it slightly differently
 * ("logistics", "Logistic") and fragmenting the data.
 */
export function CreatableCombobox({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: CreatableComboboxProps) {
  const trimmed = value.trim();
  const hasExactMatch = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  const filtered = trimmed
    ? options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
    : options;
  const items = trimmed && !hasExactMatch ? [...filtered, trimmed] : filtered;

  return (
    <Combobox.Root
      items={items}
      filter={null} // items are already filtered against `value` above
      inputValue={value}
      onInputValueChange={onValueChange}
      value={value}
      onValueChange={(next) => onValueChange(next ?? '')}
      itemToStringValue={(item: string) => item}
      disabled={disabled}
    >
      <Combobox.Input
        id={id}
        placeholder={placeholder}
        className={cn(
          'h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-base transition-[color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
      />
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <Combobox.Empty className="px-3 py-3 text-center text-sm text-muted-foreground">
              No matches — keep typing to add a new value.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1">
              {(item: string) => {
                const isCreate = !options.some((o) => o.toLowerCase() === item.toLowerCase());
                return (
                  <Combobox.Item
                    key={item}
                    value={item}
                    className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {isCreate ? <Plus className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    <span className="min-w-0 flex-1 truncate">
                      {isCreate ? `Add "${item}"` : item}
                    </span>
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
