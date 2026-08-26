'use client';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AuditActionCountEntity, GetAuditLogsAction } from '@/lib/api/generated/types';
import { actionSpec, auditActions } from './schema';

const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * What kinds of activity match the current filters, before you read a single
 * row.
 *
 * The counts come from a server-side aggregate over every matching entry, not
 * a tally of the rows in memory: the grid loads a page at a time and scrolls
 * for more, so a client-side count would start at 50, climb as you scrolled,
 * and never be a fact about anything. A number that looks like a total but
 * isn't is the failure this tool's design principles rank as its most
 * expensive.
 *
 * Each count is also a filter: the fastest way to get from "there were
 * deletions this week" to seeing only those is clicking the word "Deleted".
 */
export function ActivitySummaryStrip({
  counts,
  activeAction,
  onPickAction,
  className,
}: {
  counts: AuditActionCountEntity[];
  activeAction: GetAuditLogsAction | undefined;
  onPickAction: (action: GetAuditLogsAction | undefined) => void;
  className?: string;
}) {
  const ordered = React.useMemo(() => {
    const byAction = new Map(counts.map((c) => [c.action, c.count]));
    // Declaration order, not count order — a strip that reorders itself as the
    // filters change is unreadable at a glance, which is the only thing it's for.
    return auditActions
      .filter((action) => (byAction.get(action) ?? 0) > 0)
      .map((action) => ({ action, count: byAction.get(action)! }));
  }, [counts]);

  if (ordered.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1', className)}>
      {ordered.map(({ action, count }) => {
        const spec = actionSpec(action);
        const active = activeAction === action;
        return (
          <button
            key={action}
            type="button"
            aria-pressed={active}
            title={active ? `Stop filtering by ${spec.label}` : `Show only ${spec.label} activity`}
            onClick={() => onPickAction(active ? undefined : action)}
            className="rounded-md focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <Badge
              variant={spec.variant}
              className={cn(
                'gap-1 font-normal transition-opacity',
                // Dim the alternatives once one is picked, so the strip shows
                // which slice you're in without a second row of chrome saying so.
                !active && activeAction ? 'opacity-50' : null,
                active ? 'ring-1 ring-inset ring-current' : null,
              )}
            >
              <spec.Icon />
              <span className="font-medium tabular-nums">{numberFormat.format(count)}</span>
              {spec.label}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
