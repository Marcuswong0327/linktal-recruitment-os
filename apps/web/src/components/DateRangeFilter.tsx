'use client';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface DateRangeFilterProps {
  title: string;
  from?: string;
  to?: string;
  onChange: (range: { from?: string; to?: string }) => void;
}

const dateInputClass =
  'rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30';

/** Two plain date bounds — a lightweight faceted filter for date-range columns (e.g. Last Contacted), styled to match DataGridFacetedFilter's toolbar pill. */
export function DateRangeFilter({ title, from, to, onChange }: DateRangeFilterProps) {
  const active = Boolean(from || to);

  return (
    <DropdownMenu>
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
            <span className="text-xs">{from ?? '…'} – {to ?? '…'}</span>
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={from ?? ''}
              onChange={(e) => onChange({ from: e.target.value || undefined, to })}
              className={dateInputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={to ?? ''}
              onChange={(e) => onChange({ from, to: e.target.value || undefined })}
              className={dateInputClass}
            />
          </label>
        </div>
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-muted-foreground"
              onClick={() => onChange({ from: undefined, to: undefined })}
            >
              Clear
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
