'use client';

import { Combobox } from '@base-ui/react/combobox';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ConsultantComboboxPopup, useConsultantLookup } from '@/components/ConsultantCombobox';
import type { ConsultantEntity } from '@/lib/api/generated/types';

interface ConsultantFilterProps {
  /** Selected consultant id, '' for Unassigned, or undefined for no filter. */
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
  consultants: ConsultantEntity[];
}

/** DataGrid toolbar filter for consultant — same searchable/avatar list as the field, styled as a faceted-filter pill. */
export function ConsultantFilter({ value, onValueChange, consultants }: ConsultantFilterProps) {
  const { byId, items, labelFor, searchTextFor } = useConsultantLookup(consultants);
  const hasValue = value !== undefined;

  return (
    <Combobox.Root
      items={items}
      value={value ?? null}
      onValueChange={(next) => onValueChange(next ?? undefined)}
      itemToStringLabel={searchTextFor}
      itemToStringValue={(consultantId) => consultantId}
    >
      <Combobox.Trigger
        render={
          <Button
            variant="outline"
            className={cn(
              'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              hasValue && 'border-solid',
            )}
          />
        }
      >
        Consultant
        {hasValue ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Badge variant="muted" className="rounded-sm px-1 font-normal">
              {labelFor(value)}
            </Badge>
          </>
        ) : null}
        <ChevronDown className="opacity-50" />
      </Combobox.Trigger>

      <ConsultantComboboxPopup
        byId={byId}
        labelFor={labelFor}
        footer={
          hasValue ? (
            <>
              <Separator />
              <button
                type="button"
                onClick={() => onValueChange(undefined)}
                className="w-full px-3 py-2 text-center text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Clear
              </button>
            </>
          ) : null
        }
      />
    </Combobox.Root>
  );
}
