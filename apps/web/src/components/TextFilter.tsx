'use client';

import * as React from 'react';
import { ListFilter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';

interface TextFilterProps {
  title: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  /** Icon-only header trigger vs dashed-pill action-bar field. */
  compact?: boolean;
  /** Overrides the trigger button's layout (e.g. `w-full justify-between` in a search gate). */
  triggerClassName?: string;
}

/**
 * A single free-text filter — no fixed catalog, just a text box in a
 * toolbar-pill / header-icon popover. Commits on blur (popover close) or Enter.
 */
export function TextFilter({
  title,
  value,
  onChange,
  placeholder,
  compact = false,
  triggerClassName,
}: TextFilterProps) {
  const [draft, setDraft] = React.useState(value ?? '');
  React.useEffect(() => setDraft(value ?? ''), [value]);
  const active = Boolean(value);

  function commit() {
    onChange(draft.trim() || undefined);
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && commit()}>
      <DropdownMenuTrigger
        render={
          <Button
            variant={compact ? 'ghost' : 'outline'}
            size={compact ? 'icon-sm' : 'default'}
            aria-label={compact ? `Filter ${title}` : undefined}
            title={compact ? `Filter ${title}` : undefined}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              compact
                ? 'text-muted-foreground hover:text-foreground'
                : 'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              !compact && active && 'border-solid',
              compact && active && 'text-primary',
              triggerClassName,
            )}
          />
        }
      >
        {compact ? (
          <ListFilter className={cn('size-4', !active && 'opacity-60')} />
        ) : placeholder ? (
          // A `placeholder` caller already labels this field externally (a
          // `FilterField` above it) — just the value/placeholder, no title
          // prefix, same shape as DataGridFacetedFilter / LocationFilterButton.
          <span className={cn('min-w-0 flex-1 truncate text-left', !active && 'text-muted-foreground')}>
            {value ?? placeholder}
          </span>
        ) : (
          <>
            {title}
            {active ? (
              <>
                <span className="mx-0.5 h-4 w-px bg-border" />
                <span className="text-xs">{value}</span>
              </>
            ) : null}
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-3">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          placeholder={placeholder ?? title}
          {...noBrowserAutofill}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
