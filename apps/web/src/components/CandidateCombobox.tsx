'use client';

import { useMemo, useCallback } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CandidateEntity } from '@/lib/api/generated/types';
import { candidateFullName } from '@/features/candidates/schema';

/** Shared lookup + display helpers for any Combobox picking a candidate. */
export function useCandidateLookup(candidates: CandidateEntity[]) {
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const items = useMemo(() => candidates.map((c) => c.id), [candidates]);

  const labelFor = useCallback(
    (candidateId: string) => {
      const candidate = byId.get(candidateId);
      return candidate ? candidateFullName(candidate) || 'Unnamed candidate' : 'Unknown';
    },
    [byId],
  );
  // Drives filtering — combine name + current role so typing either finds the match.
  const searchTextFor = useCallback(
    (candidateId: string) => {
      const candidate = byId.get(candidateId);
      return candidate ? `${candidateFullName(candidate)} ${candidate.currentRole ?? ''}` : candidateId;
    },
    [byId],
  );

  return { byId, items, labelFor, searchTextFor };
}

interface CandidateComboboxProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  candidates: CandidateEntity[];
  disabled?: boolean;
  className?: string;
}

/** Searchable candidate picker — same reasoning as ClientCombobox/ConsultantCombobox. */
export function CandidateCombobox({ id, value, onValueChange, candidates, disabled, className }: CandidateComboboxProps) {
  const { byId, items, labelFor, searchTextFor } = useCandidateLookup(candidates);

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next) => next != null && onValueChange(next)}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(candidateId) => candidateId}
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
          <Combobox.Value>{() => (value ? labelFor(value) : 'Select a candidate')}</Combobox.Value>
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
                placeholder="Search candidates…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground">
              No candidates found.
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
              {(candidateId: string) => {
                const candidate = byId.get(candidateId);
                return (
                  <Combobox.Item
                    key={candidateId}
                    value={candidateId}
                    className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{labelFor(candidateId)}</span>
                      {candidate?.currentRole ? (
                        <span className="truncate text-xs text-muted-foreground">{candidate.currentRole}</span>
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
    </Combobox.Root>
  );
}
