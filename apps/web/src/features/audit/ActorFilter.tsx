'use client';

import { Combobox } from '@base-ui/react/combobox';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConsultantComboboxPopup, UNASSIGNED, useConsultantLookup } from '@/components/ConsultantCombobox';
import type { ConsultantEntity } from '@/lib/api/generated/types';

/**
 * Single-select "who did this" filter — the API's actorId is one id, not a
 * list, so the trigger is its own (a toolbar pill, matching Action/Record
 * type), but the search/avatar/email popup is the same
 * ConsultantComboboxPopup every other consultant picker in the app uses.
 */
export function ActorFilter({
  consultants,
  value,
  onValueChange,
}: {
  consultants: ConsultantEntity[];
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
}) {
  const { byId, items, labelFor, searchTextFor } = useConsultantLookup(consultants);
  // useConsultantLookup adds a synthetic "Unassigned" entry for record-field
  // pickers — doesn't apply to an actor: every audit row's actor is either a
  // real consultant or null (the system), and there's no "system-only" filter.
  const selectableItems = items.filter((id) => id !== UNASSIGNED);

  return (
    <Combobox.Root
      items={selectableItems}
      value={value ?? null}
      onValueChange={(next) => onValueChange(next ?? undefined)}
      itemToStringLabel={searchTextFor}
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
            <span className="text-xs">{labelFor(value)}</span>
          </>
        ) : null}
        <ChevronDown className="opacity-50" />
      </Combobox.Trigger>

      <ConsultantComboboxPopup
        byId={byId}
        labelFor={labelFor}
        footer={
          value ? (
            <button
              type="button"
              onClick={() => onValueChange(undefined)}
              className="w-full border-t border-border px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </button>
          ) : null
        }
      />
    </Combobox.Root>
  );
}
