'use client';

import { useMemo, useCallback } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, UserRound } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ConsultantEntity } from '@/lib/api/generated/types';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export const UNASSIGNED = '';

export function ConsultantAvatar({
  consultantId,
  name,
  size = 6,
}: {
  consultantId: string;
  name?: string;
  size?: 5 | 6;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        size === 6 ? 'size-6 text-[10px]' : 'size-5 text-[9px]',
        consultantId === UNASSIGNED
          ? 'border border-dashed border-muted-foreground/40 text-muted-foreground'
          : 'bg-primary/10 text-primary',
      )}
    >
      {consultantId === UNASSIGNED ? (
        <UserRound className={size === 6 ? 'size-3.5' : 'size-3'} />
      ) : (
        initials(name ?? '?')
      )}
    </span>
  );
}

/** Shared lookup + display helpers for any Combobox picking a consultant. */
export function useConsultantLookup(consultants: ConsultantEntity[]) {
  const byId = useMemo(() => new Map(consultants.map((c) => [c.id, c])), [consultants]);
  const items = useMemo(() => [UNASSIGNED, ...consultants.map((c) => c.id)], [consultants]);

  const labelFor = useCallback(
    (consultantId: string) =>
      consultantId === UNASSIGNED ? 'Unassigned' : (byId.get(consultantId)?.fullName ?? 'Unknown'),
    [byId],
  );
  // Drives filtering — combine name + email so typing either finds the match.
  const searchTextFor = useCallback(
    (consultantId: string) => {
      if (consultantId === UNASSIGNED) return 'Unassigned';
      const consultant = byId.get(consultantId);
      return consultant ? `${consultant.fullName} ${consultant.email}` : consultantId;
    },
    [byId],
  );

  return { byId, items, labelFor, searchTextFor };
}

interface ConsultantComboboxPopupProps {
  byId: Map<string, ConsultantEntity>;
  labelFor: (consultantId: string) => string;
  /** Extra content after the list — e.g. a "Clear" row for filter usage. */
  footer?: React.ReactNode;
  /** Positions the popup against an element other than Combobox.Trigger — e.g. when there's no trigger of our own. */
  anchor?: React.RefObject<Element | null>;
}

/**
 * The search input + filtered, avatar-rowed item list — shared popup body
 * for any `Combobox.Root` picking a consultant (field, filter, bulk action).
 */
export function ConsultantComboboxPopup({ byId, labelFor, footer, anchor }: ConsultantComboboxPopupProps) {
  return (
    <Combobox.Portal>
      <Combobox.Positioner align="start" sideOffset={4} anchor={anchor} className="isolate z-50">
        <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
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
            {(consultantId: string) => {
              const consultant = byId.get(consultantId);
              return (
                <Combobox.Item
                  key={consultantId}
                  value={consultantId}
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <ConsultantAvatar consultantId={consultantId} name={consultant?.fullName} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{labelFor(consultantId)}</span>
                    {consultant?.email ? (
                      <span className="truncate text-xs text-muted-foreground">{consultant.email}</span>
                    ) : null}
                  </span>
                  <Combobox.ItemIndicator className="shrink-0">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              );
            }}
          </Combobox.List>
          {footer}
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  );
}

interface ConsultantComboboxProps {
  id?: string;
  /** Consultant id, or '' for Unassigned. */
  value: string;
  onValueChange: (value: string) => void;
  consultants: ConsultantEntity[];
  disabled?: boolean;
  /** Overrides the trigger's default `w-full` sizing — e.g. `w-fit mx-auto` for a compact, centered table cell. */
  className?: string;
}

/**
 * Searchable consultant picker. A plain dropdown doesn't scale once the
 * roster grows and names collide (several consultants can share a first
 * name) — this filters by name + email and shows both in the list so
 * same-named consultants are still distinguishable.
 */
export function ConsultantCombobox({
  id,
  value,
  onValueChange,
  consultants,
  disabled,
  className,
}: ConsultantComboboxProps) {
  const { byId, items, labelFor, searchTextFor } = useConsultantLookup(consultants);

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next ?? UNASSIGNED)}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(consultantId) => consultantId}
      disabled={disabled}
    >
      <Combobox.Trigger
        id={id}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <ConsultantAvatar consultantId={value} name={byId.get(value)?.fullName} size={5} />
        <span className={cn('min-w-0 flex-1 truncate text-left', value === UNASSIGNED && 'text-muted-foreground')}>
          <Combobox.Value>{() => labelFor(value)}</Combobox.Value>
        </span>
        <Combobox.Icon className="text-muted-foreground">
          <ChevronDown className="pointer-events-none size-4 shrink-0" />
        </Combobox.Icon>
      </Combobox.Trigger>

      <ConsultantComboboxPopup byId={byId} labelFor={labelFor} />
    </Combobox.Root>
  );
}
