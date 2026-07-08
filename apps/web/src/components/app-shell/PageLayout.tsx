import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Standard content container for a page inside the app shell.
 * Owns the max-width, padding and vertical rhythm so every entity page
 * lines up. Compose with `PageHeader` + page content (e.g. a `DataGrid`).
 */
function PageLayout({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-layout"
      className={cn('mx-auto flex w-full flex-col gap-5 max-w-[90%] p-6', className)}
      {...props}
    />
  );
}

function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<'header'> & {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optional entity icon (reuse the matching one from `config/nav`). */
  icon?: LucideIcon;
}) {
  return (
    <header data-slot="page-header" className={cn('flex items-start justify-between gap-4', className)} {...props}>
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export { PageLayout, PageHeader };
