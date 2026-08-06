'use client';

import * as React from 'react';
import {
  Archive,
  ArchiveRestore,
  Clock3,
  Copy,
  Info,
  Lock,
  PencilLine,
  Plus,
  Trash2,
  TriangleAlert,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ProfileField';
import { cn } from '@/lib/utils';
import type { ResolvedChange, ResolvedValue } from '@/lib/api/generated/types';
import {
  type AuditLog,
  auditActionLabels,
  auditActionVariants,
  describeAction,
  describeActor,
  hasPreviousValue,
  isEmptyValue,
  metadataRows,
  realEntityId,
  relativeTime,
  requestIdOf,
} from './schema';

// Weekday included on purpose: "Thu" is how people remember when something
// happened; the date alone makes them count back.
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Carries the same meaning as the action badge's colour, for anyone reading
// shape before colour. No new meanings, so no new colour is spent.
const actionIcons: Record<string, LucideIcon> = {
  CREATE: Plus,
  UPDATE: PencilLine,
  SOFT_DELETE: Archive,
  RESTORE: ArchiveRestore,
  DEACTIVATE: UserRoundX,
  HARD_DELETE: Trash2,
};

function copyToClipboard(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Couldn't copy ${label.toLowerCase()}`),
  );
}

/** Side sheet showing one audit entry in plain language (no raw JSON). */
export function ActivityDetail({ entry, onClose }: { entry: AuditLog | null; onClose: () => void }) {
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {entry && <Body entry={entry} />}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Reads top-down as an answer to three questions, in the order an admin asks
 * them: what happened (headline + sentence), what exactly changed (the field
 * list), and — last, deliberately quiet — the ids support would ask for.
 */
function Body({ entry }: { entry: AuditLog }) {
  const narrative = describeAction(entry.action, entry.entityTypeLabel);
  const actor = describeActor(entry);
  const rows = entry.resolvedChanges ?? [];
  const meta = metadataRows(entry.metadata);
  const requestId = requestIdOf(entry.metadata);
  const recordId = realEntityId(entry.entityId);
  const ActionIcon = actionIcons[entry.action] ?? PencilLine;

  const when = new Date(entry.createdAt);
  const hasFieldList = rows.length > 0 || entry.omittedFieldCount > 0;

  return (
    <>
      <SheetHeader className="gap-2 pr-12 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={auditActionVariants[entry.action] ?? 'secondary'}>
            <ActionIcon />
            {auditActionLabels[entry.action] ?? entry.action}
          </Badge>
          <span className="text-xs text-muted-foreground">{entry.entityTypeLabel}</span>
          {entry.entityDeleted ? (
            <Badge variant="warning" title="This record is archived right now — it is hidden from lists but can be restored.">
              Archived
            </Badge>
          ) : null}
        </div>

        {/* The record's own name is the heading: an admin arrives here
            thinking "what happened to Jane Doe", not "what happened to a
            Candidate row". */}
        <SheetTitle className="text-lg leading-snug break-words">
          {entry.entityLabel ?? `A ${entry.entityTypeLabel.toLowerCase()} record`}
        </SheetTitle>

        <SheetDescription>
          <span className="font-medium text-foreground">{actor.name}</span> {narrative.verb}
          <span className="text-muted-foreground"> · {relativeTime(when)}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-5 px-6 pb-8 text-sm">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" />
          <span className="tabular-nums">{dateFormatter.format(when)}</span>
        </p>

        {actor.unresolvedId ? (
          <Note>
            The account behind this change has since been removed, so there is no name to show —
            only its id, <span className="font-mono break-all">{actor.unresolvedId}</span>.
          </Note>
        ) : null}

        {narrative.consequence ? <Note severe={narrative.severe}>{narrative.consequence}</Note> : null}

        {hasFieldList ? (
          <section className="flex flex-col gap-2">
            <Eyebrow>{narrative.fieldsHeading}</Eyebrow>
            <dl className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-muted/25">
              {rows.map((r) => (
                <ChangeRow key={r.field} row={r} />
              ))}
              {entry.omittedFieldCount > 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Not listed:{' '}
                  {entry.omittedFieldCount === 1
                    ? '1 other field that was'
                    : `${entry.omittedFieldCount} other fields that were`}{' '}
                  empty or internal bookkeeping.
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {!hasFieldList && !narrative.consequence ? (
          <p className="text-muted-foreground">No field-by-field detail was recorded for this entry.</p>
        ) : null}

        {meta.length > 0 ? (
          <section className="flex flex-col gap-2">
            <Eyebrow>Context</Eyebrow>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
              {meta.map((m) => (
                <React.Fragment key={m.label}>
                  <dt className="text-xs text-muted-foreground">{m.label}</dt>
                  <dd className="min-w-0 break-words">{m.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        ) : null}

        {/* Recessed, last, and smaller than everything above it: nobody reads
            an activity entry for these, they only fetch one when raising a
            problem — so the explanations stay (they're unguessable) but at a
            weight that can't compete with the who/what/when. */}
        {recordId || requestId ? (
          <section className="mt-1 flex flex-col gap-3 rounded-lg bg-muted/60 px-3 py-3">
            <Eyebrow>For support</Eyebrow>
            {recordId ? (
              <TechnicalRef
                label="Record ID"
                value={recordId}
                description={`If you ask support about ${entry.entityLabel ? `“${entry.entityLabel}”` : 'this record'}, share this — it points them straight to it.`}
              />
            ) : null}
            {requestId ? (
              <TechnicalRef
                label="Support reference"
                value={requestId}
                description="Share this too if you're reporting a problem with this specific change — it lets support find exactly what happened, faster."
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </>
  );
}

/**
 * One field, read as "this is what it says now" with the old value demoted to
 * a footnote underneath — rather than a symmetrical `old → new` diff, which
 * asks the reader to work out which side is current. A CREATE or a
 * HARD_DELETE snapshot has no old side at all and collapses to one line.
 */
function ChangeRow({ row }: { row: ResolvedChange }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 px-3 py-2">
      <dt className="pt-px text-xs break-words text-muted-foreground">{row.fieldLabel}</dt>
      <dd className="min-w-0">
        <Value value={row.to} />
        {hasPreviousValue(row.from) ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            was <Value value={row.from} previous />
          </p>
        ) : null}
      </dd>
    </div>
  );
}

/** A resolved value as markup: restricted values read as locked, missing ones as the word "empty", and a value pointing at an archived record says so. */
function Value({ value, previous = false }: { value: ResolvedValue; previous?: boolean }) {
  if (value.redacted) {
    return (
      <span
        className="inline-flex items-center gap-1 text-muted-foreground"
        title="Restricted field — hidden from this view, not blank"
      >
        <Lock className="size-3 shrink-0" />
        Hidden
      </span>
    );
  }
  if (isEmptyValue(value)) {
    return <span className="text-muted-foreground italic">empty</span>;
  }
  const text = value.label ?? String(value.raw);
  return (
    <>
      {/* The archived flag is a sibling, not a child: a line-through on an
          ancestor is painted across its descendants and can't be turned off
          from inside, and striking out the flag would read as untrue. */}
      <span className={cn('break-words', previous ? 'line-through' : 'font-medium text-foreground')}>{text}</span>
      {value.deleted ? <span className="ml-1 text-warning">(archived)</span> : null}
    </>
  );
}

/** A short aside about what an action means going forward — the "should I care" line. Colour only when the answer is yes. */
function Note({ severe = false, children }: { severe?: boolean; children: React.ReactNode }) {
  const Icon = severe ? TriangleAlert : Info;
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed',
        severe ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function TechnicalRef({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => copyToClipboard(value, label)}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="group inline-flex min-w-0 items-baseline gap-1 rounded-sm font-mono text-[11px] text-foreground/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <span className="break-all">{value}</span>
          {/* Also revealed on keyboard focus — otherwise a tabbing user gets
              a button with no visible affordance at all. */}
          <Copy className="size-3 shrink-0 self-center opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" />
        </button>
      </div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
