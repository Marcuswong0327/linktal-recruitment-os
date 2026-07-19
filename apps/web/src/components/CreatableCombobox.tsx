'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

const CREATE_SENTINEL = '__create__';

export interface CreatableComboboxOption {
  id: string;
  name: string;
}

interface CreatableComboboxProps {
  id?: string;
  /** Selected option's id — '' for none. */
  value: string;
  onValueChange: (id: string) => void;
  /** Existing rows to search/pick from. */
  options: CreatableComboboxOption[];
  /** Called for "Add <name>" — must persist it and return the created (or already-existing) row. */
  onCreate: (name: string) => Promise<CreatableComboboxOption>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Trigger + searchable popup for picking (or creating) a row — same shape as
 * `ConsultantCombobox`, minus the avatar: a closed trigger showing the
 * current selection, opening onto its own search box and item list. Typing a
 * name that doesn't exist yet offers "Add <name>", which persists it and
 * commits an id instead of raw text, so the value stays a real reference to
 * a shared, reusable row instead of fragmenting near-duplicate spellings.
 */
export function CreatableCombobox({
  id,
  value,
  onValueChange,
  options,
  onCreate,
  placeholder,
  disabled,
  className,
}: CreatableComboboxProps) {
  const byId = React.useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const label = byId.get(value)?.name ?? '';

  // The popup's own search text — separate from the trigger's displayed
  // value, and reset each time the popup opens so it always starts as a
  // fresh search rather than showing whatever was last typed.
  const [inputValue, setInputValue] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const trimmed = inputValue.trim();
  const hasExactMatch = options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase());
  const filtered = trimmed
    ? options.filter((o) => o.name.toLowerCase().includes(trimmed.toLowerCase()))
    : options;
  const items =
    trimmed && !hasExactMatch
      ? [...filtered.map((o) => o.id), CREATE_SENTINEL]
      : filtered.map((o) => o.id);

  async function handleSelect(itemId: string | null) {
    if (itemId === null) return;
    if (itemId === CREATE_SENTINEL) {
      const name = trimmed;
      if (!name) return;
      setCreating(true);
      try {
        const created = await onCreate(name);
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
      filter={null} // items are already filtered against inputValue above
      value={value}
      onValueChange={handleSelect}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      onOpenChange={(open) => {
        if (open) setInputValue('');
      }}
      itemToStringValue={(item: string) => item}
      disabled={disabled || creating}
    >
      <Combobox.Trigger
        id={id}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span
          className={cn('min-w-0 flex-1 truncate text-left', !label && 'text-muted-foreground')}
        >
          <Combobox.Value>{() => label || placeholder || 'Select…'}</Combobox.Value>
        </span>
        <Combobox.Icon className="text-muted-foreground">
          <ChevronDown className="pointer-events-none size-4 shrink-0" />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder="Search or add new…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground">
              No matches — keep typing to add a new value.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
              {(itemId: string) => {
                const isCreate = itemId === CREATE_SENTINEL;
                const itemLabel = isCreate ? trimmed : (byId.get(itemId)?.name ?? itemId);
                return (
                  <Combobox.Item
                    key={itemId}
                    value={itemId}
                    className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {isCreate ? <Plus className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    <span className="min-w-0 flex-1 truncate">
                      {isCreate ? `Add "${itemLabel}"` : itemLabel}
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
