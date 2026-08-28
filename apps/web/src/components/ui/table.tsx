import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({
  className,
  overlay,
  ...props
}: React.ComponentProps<'table'> & {
  /**
   * Rendered centered over the visible viewport of the scroll container —
   * not over the (possibly much wider/taller) `<table>` itself — so an
   * empty/no-results state stays centered on screen regardless of scroll
   * position, instead of centering against the full scrolled table and
   * ending up off to the side. Absolutely positioned against
   * `table-container` (not a descendant of the scrolling `<table>`), which
   * is what keeps it from scrolling away with the table's content.
   */
  overlay?: React.ReactNode;
}) {
  return (
    <div data-slot="table-container" className="relative h-full w-full overflow-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          {overlay}
        </div>
      ) : null}
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'sticky top-0 z-10 bg-muted backdrop-blur-sm [&_tr]:border-b [&_tr]:border-border',
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-muted/35', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border transition-colors data-[state=selected]:bg-primary/10 data-[state=selected]:ring-1 data-[state=selected]:ring-inset data-[state=selected]:ring-primary/50 data-[state=selected]:hover:bg-primary/15',
        // Keeps the tbody's even-row stripe going through the selected state
        // instead of flattening into one solid block — same idea, tinted
        // primary instead of muted, at higher specificity so it wins over
        // the plain data-[state=selected] rule above on even rows.
        '[&:nth-child(even)]:data-[state=selected]:bg-primary/15 [&:nth-child(even)]:data-[state=selected]:hover:bg-primary/20',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-semibold tracking-wide text-foreground/80 uppercase whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-px',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      // `relative` with no offsets — invisible by itself, but lets a cell's
      // own content anchor an `absolute inset-0` overlay to the true cell
      // box (e.g. a full-cell click target) without depending on percentage
      // width/height propagating correctly through whatever wrapper divs
      // sit in between, which in practice didn't.
      className={cn(
        'relative overflow-hidden px-3 py-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-px',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
