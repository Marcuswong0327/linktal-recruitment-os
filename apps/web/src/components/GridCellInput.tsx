'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

type GridCellInputProps = Omit<React.ComponentProps<'input'>, 'className'> & {
  className?: string;
};

/**
 * A plain text cell for a DataGrid new-row — the free-text counterpart to
 * `GridCellCombobox`, for fields with no catalog behind them (a person's
 * name, an email, a URL).
 *
 * Chrome-less at rest so an untouched row reads as an empty table row rather
 * than a form, with the border appearing on hover/focus to show it's editable.
 */
export function GridCellInput({ className, ...props }: GridCellInputProps) {
  return (
    <input
      type="text"
      autoComplete="off"
      className={cn(
        'h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-input focus:border-ring focus:bg-background disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
