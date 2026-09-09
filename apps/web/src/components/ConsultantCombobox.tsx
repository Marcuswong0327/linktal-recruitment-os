'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, ListFilter, UserRound, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';
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

/** Minimal identity of the logged-in user, for the "(You)" label below. */
export interface CurrentConsultant {
  id: string;
  fullName: string;
}

/**
 * Shared lookup + display helpers for any Combobox picking a consultant.
 *
 * `currentUser` (optional) is merged in as a synthetic entry when it isn't
 * already in `consultants` — GET /consultants is admin/manager only (see
 * rbac-roles.md §2), so every other role's roster fetch comes back empty,
 * and without this a company/candidate assigned to the logged-in user shows
 * "Unknown" instead of their own name. The merged entry also gets the
 * "(You)" suffix so it's clear at a glance which row is theirs.
 */
export function useConsultantLookup(
  consultants: ConsultantEntity[],
  currentUser?: CurrentConsultant | null,
) {
  const merged = useMemo(() => {
    if (!currentUser || consultants.some((c) => c.id === currentUser.id)) return consultants;
    return [
      ...consultants,
      {
        id: currentUser.id,
        displayId: '',
        azureId: null,
        email: '',
        fullName: currentUser.fullName,
        jobTitleId: null,
        salary: null,
        costTo: null,
        reportsToId: null,
        roleId: null,
        isActive: true,
        pendingApproval: false,
        lastLoginAt: null,
        createdAt: '',
        updatedAt: '',
      } satisfies ConsultantEntity,
    ];
  }, [consultants, currentUser]);

  const byId = useMemo(() => new Map(merged.map((c) => [c.id, c])), [merged]);
  const items = useMemo(() => [UNASSIGNED, ...merged.map((c) => c.id)], [merged]);

  const labelFor = useCallback(
    (consultantId: string) => {
      if (consultantId === UNASSIGNED) return 'Unassigned';
      const consultant = byId.get(consultantId);
      if (!consultant) return 'Unknown';
      return consultantId === currentUser?.id ? `${consultant.fullName} (You)` : consultant.fullName;
    },
    [byId, currentUser],
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
              {...noBrowserAutofill}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground empty:hidden">
            No consultants found.
          </Combobox.Empty>
          <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
            {(consultantId: string) => {
              const consultant = byId.get(consultantId);
              return (
                <Combobox.Item
                  key={consultantId}
                  value={consultantId}
                  className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <ConsultantAvatar consultantId={consultantId} name={consultant?.fullName} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{labelFor(consultantId)}</span>
                    {consultant?.email ? (
                      <span className="truncate text-xs text-muted-foreground">{consultant.email}</span>
                    ) : null}
                  </span>
                  <Combobox.ItemIndicator className="shrink-0">
                    <Check className="size-4 !text-primary" />
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
  /** The logged-in user — shows "(You)" on their own entry, see useConsultantLookup. */
  currentUser?: CurrentConsultant | null;
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
  currentUser,
}: ConsultantComboboxProps) {
  const { byId, items, labelFor, searchTextFor } = useConsultantLookup(consultants, currentUser);

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

export interface ConsultantMultiSelectProps {
  id?: string;
  /** Selected consultant ids — no "Unassigned" option here, unlike the single-select field. */
  selected: string[];
  onChange: (ids: string[]) => void;
  consultants: ConsultantEntity[];
  disabled?: boolean;
  placeholder?: string;
  /** The logged-in user — shows "(You)" on their own entry, see useConsultantLookup. */
  currentUser?: CurrentConsultant | null;
}

/**
 * Multi-select consultant picker — several people can work the same job
 * order concurrently (see JobOrderConsultant in schema.prisma). Chips +
 * add-trigger, same field shape as `LocationMultiSelect`; unlike that one,
 * the roster is small and already fetched in full, so this filters
 * client-side rather than server-searching per keystroke.
 */
export function ConsultantMultiSelect({
  id,
  selected,
  onChange,
  consultants,
  disabled = false,
  placeholder = 'Add a consultant…',
  currentUser,
}: ConsultantMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { byId, items, labelFor, searchTextFor } = useConsultantLookup(consultants, currentUser);
  const selectableItems = items.filter((item) => item !== UNASSIGNED);

  function remove(consultantId: string) {
    onChange(selected.filter((id) => id !== consultantId));
  }

  return (
    <Combobox.Root
      items={selectableItems}
      multiple
      value={selected}
      onValueChange={onChange}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(consultantId: string) => consultantId}
      disabled={disabled}
      onOpenChange={setOpen}
    >
      {/* Same click-catcher + relative wrapper pattern as LocationMultiSelect — see its doc for why. */}
      <div className="relative">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onClick={() => triggerRef.current?.click()}
          className={cn(
            'absolute inset-0 rounded-2xl outline-none transition-colors disabled:pointer-events-none',
            !disabled && 'hover:bg-accent/50',
            open && 'bg-accent/50',
          )}
        />
        <Combobox.Trigger
          ref={triggerRef}
          id={id}
          aria-label={selected.length === 0 ? placeholder : undefined}
          className="relative flex min-h-9 w-full flex-wrap items-center gap-1 rounded-2xl border border-transparent bg-input/50 px-2 py-1.5 text-left outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {selected.length === 0 ? (
            <span className="pointer-events-none text-sm text-muted-foreground">{placeholder}</span>
          ) : (
            selected.map((consultantId) => (
              <span
                key={consultantId}
                className="flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pr-1 pl-0.5 text-sm text-secondary-foreground"
              >
                <ConsultantAvatar consultantId={consultantId} name={byId.get(consultantId)?.fullName} size={5} />
                {labelFor(consultantId)}
                {!disabled ? (
                  // role="button" (not a nested <button>) — sits inside Combobox.Trigger's own <button>.
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${labelFor(consultantId)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(consultantId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(consultantId);
                      }
                    }}
                    className="cursor-pointer rounded-full opacity-70 outline-none hover:opacity-100"
                  >
                    <X className="size-3" />
                  </span>
                ) : null}
              </span>
            ))
          )}
        </Combobox.Trigger>
      </div>

      <ConsultantComboboxPopup byId={byId} labelFor={labelFor} />
    </Combobox.Root>
  );
}

export interface ConsultantFilterButtonProps {
  /** Currently selected consultant ids — multi-select. */
  selected: string[];
  onChange: (values: string[]) => void;
  consultants: ConsultantEntity[];
  title?: string;
}

/**
 * Compact icon-button variant of `ConsultantCombobox` for a `DataGridFilter`
 * header slot — same searchable, avatar-rowed popup as the field picker,
 * matching `DataGridFacetedFilter`'s `compact` trigger look instead of a
 * full-width field. Multi-select: matches any of the selected consultants.
 * `UNASSIGNED` ('') is a selectable item too (see `useConsultantLookup`), so
 * it can be combined with real ids to mean "these consultants, or none".
 */
export function ConsultantFilterButton({
  selected,
  onChange,
  consultants,
  title = 'Consultant',
}: ConsultantFilterButtonProps) {
  const { byId, items, labelFor, searchTextFor } = useConsultantLookup(consultants);

  return (
    <Combobox.Root
      items={items}
      multiple
      value={selected}
      onValueChange={onChange}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(consultantId: string) => consultantId}
    >
      <Combobox.Trigger
        aria-label={`Filter ${title}`}
        title={`Filter ${title}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground',
          selected.length > 0 && 'text-primary',
        )}
      >
        <ListFilter className={cn('size-4', selected.length === 0 && 'opacity-60')} />
      </Combobox.Trigger>
      <ConsultantComboboxPopup byId={byId} labelFor={labelFor} />
    </Combobox.Root>
  );
}
