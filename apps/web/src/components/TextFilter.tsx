'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';

interface TextFilterProps {
  title: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}

/** A single free-text filter (e.g. Location) — no fixed catalog, just a debounced-on-blur text box in a toolbar-pill popover. */
export function TextFilter({ title, value, onChange, placeholder }: TextFilterProps) {
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
            variant="outline"
            className={cn(
              'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              active && 'border-solid',
            )}
          />
        }
      >
        {title}
        {active ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <span className="text-xs">{value}</span>
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-3">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          placeholder={placeholder}
          {...noBrowserAutofill}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
