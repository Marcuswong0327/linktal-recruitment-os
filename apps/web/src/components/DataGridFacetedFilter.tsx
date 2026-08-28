'use client';

import * as React from 'react';
import { Check, ChevronDown, ListFilter } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface FacetedFilterOption {
  label: string;
  value: string;
  /** Badge variant for semantic coloring; renders the option as its pill. */
  variant?: React.ComponentProps<typeof Badge>['variant'];
}

interface DataGridFacetedFilterProps {
  title: string;
  options: FacetedFilterOption[];
  /** Currently selected values. */
  selected: string[];
  onChange: (values: string[]) => void;
  /** Selecting a value replaces the selection instead of adding to it. */
  single?: boolean;
  /** Overrides the trigger button's layout (e.g. `w-full justify-between` for a full-width search-gate dropdown instead of the compact toolbar pill). */
  triggerClassName?: string;
  /**
   * Icon-only trigger with no title text/count badge — for embedding inside a
   * column header (the header already shows the column's label), instead of
   * the toolbar's full pill with title + selected-count.
   */
  compact?: boolean;
  /** Disables the trigger — e.g. while a row's own mutation is in flight, or the caller lacks edit permission. */
  disabled?: boolean;
  /**
   * Placeholder shown when nothing's selected, e.g. "All industries" — same
   * pattern as the other action-bar filters (Country/City/Specialization).
   * Passing this also drops the persistent `title` prefix from inside the
   * trigger: a caller that supplies a placeholder is, by construction, one
   * that already shows the field's name elsewhere (e.g. a `FilterField`
   * label above it), so repeating it inside the button too is redundant and
   * eats into the trigger's limited width. Only used when `compact` is
   * false; omit to keep the old title-prefixed trigger.
   */
  placeholder?: string;
}

export function DataGridFacetedFilter({
  title,
  options,
  selected,
  onChange,
  single = false,
  triggerClassName,
  compact = false,
  disabled = false,
  placeholder,
}: DataGridFacetedFilterProps) {
  const selectedSet = new Set(selected);

  function toggle(value: string, checked: boolean) {
    if (single) {
      onChange(checked ? [value] : []);
      return;
    }
    const next = new Set(selectedSet);
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    onChange([...next]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? 'icon-sm' : 'default'}
            aria-label={compact ? `Filter ${title}` : undefined}
            title={compact ? `Filter ${title}` : undefined}
            onClick={(e) => e.stopPropagation()}
            disabled={disabled}
            className={cn(
              compact
                ? 'text-muted-foreground hover:text-foreground'
                : 'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              // Active state stays neutral — the selected value's own pill
              // carries the semantic color.
              !compact && selectedSet.size > 0 && 'border-solid',
              compact && selectedSet.size > 0 && 'text-primary',
              triggerClassName,
            )}
          />
        }
      >
        {compact ? (
          <ListFilter className={selectedSet.size > 0 ? '' : 'opacity-60'} />
        ) : placeholder ? (
          // A `placeholder` caller already labels this field externally (a
          // `FilterField` above it) — just the value/placeholder, no title
          // prefix, same shape as LocationFilterButton/SpecializationFilterButton.
          <>
            <span
              className={cn('min-w-0 flex-1 truncate text-left', selectedSet.size === 0 && 'text-muted-foreground')}
            >
              {selectedSet.size === 0
                ? placeholder
                : selectedSet.size === 1
                  ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
                  : `${selectedSet.size} selected`}
            </span>
            <ChevronDown className="ml-auto shrink-0 opacity-50" />
          </>
        ) : (
          <>
            <span className="shrink-0">{title}</span>
            {selectedSet.size > 0 ? (
              <>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
                <Badge variant="muted" className="min-w-0 flex-1 truncate rounded-sm px-1 font-normal">
                  {selectedSet.size === 1
                    ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
                    : `${selectedSet.size} selected`}
                </Badge>
              </>
            ) : null}
            <ChevronDown className="shrink-0 opacity-50" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No options available.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {options.map((option) => {
                const isChecked = selectedSet.has(option.value);
                return (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={isChecked}
                    onCheckedChange={(checked) => toggle(option.value, checked)}
                    // Leading box checkbox instead of the primitive's right-side tick.
                    className="pr-2 [&_[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors',
                        isChecked && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {isChecked ? <Check className="size-3 !text-primary-foreground" /> : null}
                    </span>
                    {option.variant ? (
                      <Badge variant={option.variant} className="rounded-md">
                        {option.label}
                      </Badge>
                    ) : (
                      option.label
                    )}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </div>
          )}
        </DropdownMenuGroup>
        {selectedSet.size > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn('justify-center text-muted-foreground')}
              onClick={() => onChange([])}
            >
              Clear
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
