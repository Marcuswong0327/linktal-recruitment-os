'use client';

import { useMemo, useCallback } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ClientEntity } from '@/lib/api/generated/types';

/** Shared lookup + display helpers for any Combobox picking a client. */
export function useClientLookup(clients: ClientEntity[]) {
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const items = useMemo(() => clients.map((c) => c.id), [clients]);

  const labelFor = useCallback((clientId: string) => byId.get(clientId)?.companyName ?? 'Unknown', [byId]);
  // Drives filtering — combine name + industry so typing either finds the match.
  const searchTextFor = useCallback(
    (clientId: string) => {
      const client = byId.get(clientId);
      return client ? `${client.companyName} ${client.industry ?? ''}` : clientId;
    },
    [byId],
  );

  return { byId, items, labelFor, searchTextFor };
}

interface ClientComboboxPopupProps {
  byId: Map<string, ClientEntity>;
  labelFor: (clientId: string) => string;
  /** Positions the popup against an element other than Combobox.Trigger — e.g. when there's no trigger of our own. */
  anchor?: React.RefObject<Element | null>;
}

/** The search input + filtered item list — shared popup body for any `Combobox.Root` picking a client. */
export function ClientComboboxPopup({ byId, labelFor, anchor }: ClientComboboxPopupProps) {
  return (
    <Combobox.Portal>
      <Combobox.Positioner align="start" sideOffset={4} anchor={anchor} className="isolate z-50">
        <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
          <div className="p-1.5">
            <Combobox.Input
              placeholder="Search clients…"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground">
            No clients found.
          </Combobox.Empty>
          <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
            {(clientId: string) => {
              const client = byId.get(clientId);
              return (
                <Combobox.Item
                  key={clientId}
                  value={clientId}
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{labelFor(clientId)}</span>
                    {client?.industry ? (
                      <span className="truncate text-xs text-muted-foreground">{client.industry}</span>
                    ) : null}
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
  );
}

interface ClientComboboxProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  clients: ClientEntity[];
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable client picker. A plain dropdown doesn't scale once the client
 * roster grows — same reasoning as ConsultantCombobox — so this filters by
 * company name + industry.
 */
export function ClientCombobox({ id, value, onValueChange, clients, disabled, className }: ClientComboboxProps) {
  const { byId, items, labelFor, searchTextFor } = useClientLookup(clients);

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next) => next != null && onValueChange(next)}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(clientId) => clientId}
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
          <Combobox.Value>{() => (value ? labelFor(value) : 'Select a client')}</Combobox.Value>
        </span>
        <Combobox.Icon className="text-muted-foreground">
          <ChevronDown className="pointer-events-none size-4 shrink-0" />
        </Combobox.Icon>
      </Combobox.Trigger>

      <ClientComboboxPopup byId={byId} labelFor={labelFor} />
    </Combobox.Root>
  );
}
