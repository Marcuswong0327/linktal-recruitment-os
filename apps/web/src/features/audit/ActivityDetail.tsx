'use client';

import * as React from 'react';
import { Clock3, Info, Lock, Route, TriangleAlert } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ProfileField';
import { cn } from '@/lib/utils';
import type { ResolvedChange, ResolvedValue } from '@/lib/api/generated/types';
import {
  type AuditLog,
  actionSpec,
  activitySentence,
  affectedRecords,
  affectedTruncated,
  describeActor,
  describeRecord,
  describeScope,
  fullTimestamp,
  exportDetail,
  hasPreviousValue,
  isEmptyValue,
  metadataRows,
  rawText,
  relativeTime,
  scopeExplanation,
  valueDate,
} from './schema';

/** Side sheet showing one audit entry in plain language (no raw JSON). */
export function ActivityDetail({
  entry,
  onClose,
  onShowAction,
}: {
  entry: AuditLog | null;
  onClose: () => void;
  /** Filter the log down to every entry from this entry's request. */
  onShowAction: (requestId: string) => void;
}) {
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {entry && <Body entry={entry} onShowAction={onShowAction} />}
      </SheetContent>
    </Sheet>
  );
}

/**
 * One spine, seven fillings.
 *
 * Every action answers the same questions in the same order — what happened,
 * to what, by whom, when, how far it reached, whether it can be undone, field
 * detail, support ids — so a reader who has seen one entry knows where to look
 * in the next. What differs per action is only *what fills* each slot, and
 * which slots are legitimately empty (an export has no field list because
 * nothing changed, not because the data is missing).
 *
 * The two shapes that used to fall straight through this and render as
 * ordinary single-record edits are handled first-class here: EXPORT, and any
 * entry whose `entityId` is the `'(bulk)'` sentinel.
 */
function Body({ entry, onShowAction }: { entry: AuditLog; onShowAction: (requestId: string) => void }) {
  const spec = actionSpec(entry.action);
  const scope = describeScope(entry);
  const record = describeRecord(entry, scope);
  const actor = describeActor(entry);
  const rows = entry.resolvedChanges ?? [];
  const meta = metadataRows(entry.metadata);
  const scopeNote = scopeExplanation(entry, scope);
  const exportInfo = exportDetail(entry, scope);
  const named = affectedRecords(entry, scope);
  const namedTruncated = affectedTruncated(entry, scope);

  const when = new Date(entry.createdAt);
  const plural = scope.isBulk && (scope.count ?? 2) !== 1;
  const fieldsHeading = spec.fieldsHeading
    ? scope.isBulk
      ? spec.fieldsHeading.bulk
      : spec.fieldsHeading.single
    : null;
  const hasFieldList = fieldsHeading !== null && (rows.length > 0 || entry.omittedFieldCount > 0);
  const matchedNothing = scope.isBulk && scope.count === 0;

  return (
    <>
      <SheetHeader className="gap-2 pr-12 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={spec.variant}>
            <spec.Icon />
            {spec.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{record.typeLabel}</span>
          {entry.entityDeleted ? (
            <Badge
              variant="warning"
              title="This record is archived right now — it is hidden from lists but can be restored."
            >
              Archived
            </Badge>
          ) : null}
        </div>

        {/* The record's own name is the heading: an admin arrives here
            thinking "what happened to Jane Doe", not "what happened to a
            Candidate row". For a bulk entry the equivalent answer is its
            size — "1,645 Clients", never the singular fallback. */}
        <SheetTitle className="text-lg leading-snug break-words">{record.title}</SheetTitle>

        <SheetDescription>
          <span className="font-medium text-foreground">{activitySentence(entry, scope)}</span>
          <span className="text-muted-foreground"> · {relativeTime(when)}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-5 px-6 pb-8 text-sm">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" />
          <span className="tabular-nums">{fullTimestamp(when)}</span>
        </p>

        {/* How far this reached, and why — directly under the headline rather
            than buried in Context at the bottom, because for a cascade or a
            bulk write it is the fact that changes what the entry means. */}
        {scopeNote ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Route className="mt-0.5 size-3.5 shrink-0" />
            <span>{scopeNote}</span>
          </p>
        ) : null}

        {actor.unresolvedId ? (
          <Note>
            The account behind this change has since been removed, so there is no name to show —
            only its id, <span className="font-mono break-all">{actor.unresolvedId}</span>.
          </Note>
        ) : null}

        {matchedNothing ? (
          <Note>This action matched no records, so nothing was changed.</Note>
        ) : spec.consequence ? (
          <Note severe={spec.severe}>{spec.consequence(plural)}</Note>
        ) : null}

        {exportInfo ? (
          <section className="flex flex-col gap-2">
            <Eyebrow>What was exported</Eyebrow>
            <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
              <p>
                <span className="font-medium text-foreground">{exportInfo.what}</span>
                <span className="text-muted-foreground"> — {exportInfo.how}</span>
              </p>
              {/* An export that named its rows can say which ones. That is the
                  difference between "someone exported a client" and knowing
                  whose data left the system. */}
              {exportInfo.records.length > 0 ? (
                <ul className="flex flex-col gap-1 border-t border-border/70 pt-2">
                  {exportInfo.records.map((label) => (
                    <li key={label} className="text-sm break-words text-foreground">
                      {label}
                    </li>
                  ))}
                  {exportInfo.truncated ? (
                    <li className="text-xs text-muted-foreground">…and the rest of the selection.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {named.length > 0 ? (
          <section className="flex flex-col gap-2">
            <Eyebrow>Which records</Eyebrow>
            <ul className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
              {named.map((label) => (
                <li key={label} className="break-words">
                  {label}
                </li>
              ))}
              {namedTruncated ? (
                <li className="text-xs text-muted-foreground">…and the rest of the {scope.count} records.</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {hasFieldList ? (
          <section className="flex flex-col gap-2">
            <Eyebrow>
              {fieldsHeading}
              {rows.length > 0 ? (
                <span className="ml-1 font-normal text-muted-foreground/70">
                  ({rows.length} {rows.length === 1 ? 'field' : 'fields'})
                </span>
              ) : null}
            </Eyebrow>
            <dl className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-muted/25">
              {rows.map((r) => (
                <ChangeRow key={r.field} row={r} bulk={scope.isBulk} />
              ))}
              {/* A bulk write records the value every matched row was set to,
                  never the values they each held before (see the backend's
                  presentRow updateMany branch) — so the missing "was" line
                  here is a property of the data, and saying so beats letting
                  it read like an ordinary edit with a gap in it. */}
              {scope.isBulk && rows.length > 0 ? (
                <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  Each record&rsquo;s previous value may have differed — this only shows what they were all
                  set to.
                </p>
              ) : null}
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

        {/* Only when there is genuinely nothing else to say. An export with no
            field list is complete, not incomplete, and an archive whose whole
            story is its consequence line doesn't need to apologise either. */}
        {!hasFieldList && !exportInfo && !spec.consequence && !scopeNote ? (
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
        {/* One click writes several entries far more often than it looks:
            creating a placement also updates the submission, the candidate,
            the job order and the client. Read as five unrelated rows sharing a
            timestamp, a client silently flipping to Traded looks unexplained —
            this is the line that explains it. */}
        {entry.requestId && entry.relatedCount > 0 ? (
          <section className="mt-1 flex flex-col items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-3">
            <Eyebrow>Part of a larger action</Eyebrow>
            <p className="text-xs text-muted-foreground">
              {entry.relatedCount === 1
                ? '1 other record changed at the same time, in the same action.'
                : `${entry.relatedCount} other records changed at the same time, in the same action.`}
            </p>
            <button
              type="button"
              onClick={() => onShowAction(entry.requestId!)}
              className="rounded-sm text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              Show everything from this action
            </button>
          </section>
        ) : null}
      </div>
    </>
  );
}

/**
 * One field, read as "this is what it says now" with the old value demoted to
 * a footnote underneath — rather than a symmetrical `old → new` diff, which
 * asks the reader to work out which side is current. A CREATE, a HARD_DELETE
 * snapshot, or any bulk write has no old side at all and collapses to one line.
 */
function ChangeRow({ row, bulk }: { row: ResolvedChange; bulk: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 px-3 py-2">
      <dt className="pt-px text-xs break-words text-muted-foreground">{row.fieldLabel}</dt>
      <dd className="min-w-0">
        <Value value={row.to} field={row.field} />
        {!bulk && hasPreviousValue(row.from) ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            was <Value value={row.from} previous />
          </p>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Email bodies are stored as HTML, so the raw value is a wall of `<p style=…>`
 * that buries the four sentences someone actually wrote.
 *
 * Rendered in a fully sandboxed iframe: no `allow-scripts`, no
 * `allow-same-origin`, so nothing in the stored markup can run or reach the
 * page around it. That matters because this is content a person typed, shown
 * back to an admin — `dangerouslySetInnerHTML` here would be a stored-XSS
 * sink, and sanitising by hand is a worse bet than letting the browser refuse
 * to execute anything at all.
 */
function HtmlValue({ html }: { html: string }) {
  const [showSource, setShowSource] = React.useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{showSource ? 'HTML source' : 'Preview'}</span>
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          {showSource ? 'Show preview' : 'Show HTML source'}
        </button>
      </div>
      {showSource ? (
        <pre className="max-h-64 overflow-auto rounded-md border border-border/70 bg-background p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {html}
        </pre>
      ) : (
        <iframe
          title="Email body preview"
          sandbox=""
          srcDoc={html}
          className="h-64 w-full rounded-md border border-border/70 bg-white"
        />
      )}
    </div>
  );
}

/** Looks like markup rather than a sentence that happens to contain an angle bracket. */
function isHtml(field: string, text: string): boolean {
  return /html$/i.test(field) || /<\/?[a-z][\s\S]*>/i.test(text);
}

/** A resolved value as markup: restricted values read as locked, missing ones as the word "empty", and a value pointing at an archived record says so. */
function Value({ value, previous = false, field }: { value: ResolvedValue; previous?: boolean; field?: string }) {
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
  const text = value.kind === 'date' ? valueDate(value.raw) : (value.label ?? rawText(value.raw));
  // Only the current value gets a preview — the struck-through "was" line is a
  // footnote, and a second iframe under it would dominate the row it belongs to.
  if (!previous && field && isHtml(field, text)) return <HtmlValue html={text} />;
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

