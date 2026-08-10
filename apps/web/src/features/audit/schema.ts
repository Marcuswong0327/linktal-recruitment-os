import type { AuditLogEntity, ResolvedChange, ResolvedValue } from '@/lib/api/generated/types';
import { GetAuditLogsAction } from '@/lib/api/generated/types';

export type AuditLog = AuditLogEntity;

export const auditActions = Object.values(GetAuditLogsAction);

// Each label has to read unambiguously on its own — a table row or filter
// pill shows just the badge, with no room for the longer explanation the
// detail sheet gives (see ACTION_SENTENCE below). SOFT_DELETE is "Archived"
// rather than "Deleted" specifically so it doesn't collide with
// HARD_DELETE's "Deleted" — the recoverable one needed a different word,
// not the irreversible one.
export const auditActionLabels: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  SOFT_DELETE: 'Archived',
  RESTORE: 'Restored',
  DEACTIVATE: 'Deactivated',
  HARD_DELETE: 'Deleted',
};

// Maps to the Badge component's variants (default/secondary/outline/success/destructive).
export const auditActionVariants: Record<string, 'success' | 'secondary' | 'destructive' | 'outline'> = {
  CREATE: 'success',
  UPDATE: 'secondary',
  SOFT_DELETE: 'destructive',
  RESTORE: 'success',
  DEACTIVATE: 'outline',
  HARD_DELETE: 'destructive',
};

// The entity types the audit extension records (see AUDITED_MODELS in
// prisma.extensions.ts) — the full set, so the Record type filter can
// actually reach everything the table shows (previously missing Interview,
// Tob, Role, Permission and ConsultantIndustry entirely).
export const auditEntityTypes = [
  'Candidate',
  'Client',
  'Stakeholder',
  'JobOrder',
  'CandidateSubmission',
  'Placement',
  'Interview',
  'ClientJobResearch',
  'Consultant',
  'Role',
  'Permission',
  'Tob',
  'ConsultantIndustry',
] as const;

// Mirrors the backend's entityTypeLabel (audit-schema.map.ts) for the one
// place the frontend needs a friendly name without an API row to read it
// from: the static Record-type filter dropdown. Every row's own label comes
// straight from the API (AuditLogEntity.entityTypeLabel) — this is not a
// second source of truth for that, just for this list's option labels.
const ENTITY_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  JobOrder: 'Job Order',
  CandidateSubmission: 'Submission',
  ClientJobResearch: 'Job Research',
  ConsultantIndustry: 'Industry Assignment',
  Tob: 'Terms of Business',
};

export function entityTypeFilterLabel(entityType: string): string {
  return ENTITY_TYPE_LABEL_OVERRIDES[entityType] ?? entityType.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * What one audit entry *means*, in the words an admin would use — the detail
 * sheet's whole narrative comes from here so the tone stays consistent.
 *
 * `fieldsHeading` exists because the list of fields under it is three
 * different things depending on the action, and calling them all "changes"
 * misleads: an UPDATE is a real before → after diff, a CREATE is the values
 * the record started life with, and a HARD_DELETE is the last surviving copy
 * of a row that no longer exists (see the backend's audit-presenter.ts).
 *
 * `consequence` answers "should I care" for the actions that have a lasting
 * effect; null for the ones where the fields already say everything.
 */
export interface ActionNarrative {
  /** Past-tense verb phrase, completed with the actor: "Joe Lim {verb}." */
  verb: string;
  fieldsHeading: string;
  consequence: string | null;
  /** Whether the consequence is a warning worth colour, or just a note. */
  severe: boolean;
}

const ACTION_NARRATIVE: Record<string, ActionNarrative> = {
  CREATE: {
    verb: 'added this {type}',
    fieldsHeading: 'What was filled in',
    consequence: null,
    severe: false,
  },
  UPDATE: {
    verb: 'edited this {type}',
    fieldsHeading: 'What changed',
    consequence: null,
    severe: false,
  },
  SOFT_DELETE: {
    verb: 'archived this {type}',
    fieldsHeading: 'What changed',
    consequence: 'It no longer shows up in lists or searches, but nothing was lost — it can be restored.',
    severe: false,
  },
  RESTORE: {
    verb: 'restored this {type}',
    fieldsHeading: 'What changed',
    consequence: 'It is back in lists and searches as it was before.',
    severe: false,
  },
  DEACTIVATE: {
    verb: 'deactivated this account',
    fieldsHeading: 'What changed',
    consequence: 'This person can no longer sign in. The records they own are untouched.',
    severe: false,
  },
  HARD_DELETE: {
    verb: 'permanently deleted this {type}',
    fieldsHeading: 'What the record held when it was deleted',
    consequence: 'This cannot be undone — this activity entry is the only remaining record of it.',
    severe: true,
  },
};

const FALLBACK_NARRATIVE: ActionNarrative = {
  verb: 'changed this {type}',
  fieldsHeading: 'What changed',
  consequence: null,
  severe: false,
};

/** The narrative for one action, with `{type}` filled in from the record's friendly type name ("job order", "candidate"). */
export function describeAction(action: string, entityTypeLabel: string): ActionNarrative {
  const n = ACTION_NARRATIVE[action] ?? FALLBACK_NARRATIVE;
  return { ...n, verb: n.verb.replace('{type}', entityTypeLabel.toLowerCase()) };
}

/**
 * Who to name as the actor. A null name with a non-null id means the
 * consultant record behind it is gone (hard-purged) — say that in words and
 * keep the id as a footnote, rather than printing a raw uuid where a person's
 * name should be, which is what the table and the old sheet both did.
 */
export function describeActor(entry: Pick<AuditLog, 'actorName' | 'actorId'>): { name: string; unresolvedId: string | null } {
  if (entry.actorName) return { name: entry.actorName, unresolvedId: null };
  if (entry.actorId) return { name: 'Unknown user', unresolvedId: entry.actorId };
  return { name: 'The system', unresolvedId: null };
}

/** True when a resolved value stands for "nothing here" — rendered as the word "empty" rather than a symbol, because the readers of this page are not developers. */
export function isEmptyValue(v: ResolvedValue): boolean {
  // `raw` is typed as a JSON object by the generator but is in practice any
  // JSON scalar, so an empty string has to be compared through unknown.
  const raw: unknown = v.raw;
  return !v.redacted && v.label == null && (raw == null || raw === '');
}

/**
 * One resolved value, rendered as a human string — the single place that
 * decides how a redacted/deleted/unresolved value *reads*. Used verbatim by
 * the table's one-line summary; the detail sheet makes the same three
 * decisions as markup (a lock chip, an italic "empty", a flagged "(deleted)")
 * off the same predicates, so the two can't disagree on meaning.
 */
export function displayValue(v: ResolvedValue): string {
  if (v.redacted) return 'hidden';
  if (isEmptyValue(v)) return 'empty';
  const base = v.label ?? String(v.raw);
  // "archived", not "deleted" — the flag means soft-deleted, and the action
  // labels already reserve "Deleted" for the irreversible HARD_DELETE.
  return v.deleted ? `${base} (archived)` : base;
}

/** Whether a resolved value's "from" side is worth showing at all — a CREATE's pseudo-diff always has an empty `from` (see backend's audit-presenter.ts), so it should render as "Field: value", not "Field: empty → value". */
export function hasPreviousValue(v: ResolvedValue): boolean {
  return v.redacted === true || v.raw != null || v.label != null;
}

const SUMMARY_FIELD_CAP = 4;

/** Renders `resolvedChanges` as a short one-line summary for the table's Changes column. */
export function summarizeResolvedChanges(rows: ResolvedChange[] | null): string {
  if (!rows || rows.length === 0) return '—';
  const parts = rows.slice(0, SUMMARY_FIELD_CAP).map((r) => {
    const to = displayValue(r.to);
    return hasPreviousValue(r.from) ? `${r.fieldLabel}: ${displayValue(r.from)} → ${to}` : `${r.fieldLabel}: ${to}`;
  });
  const extra = rows.length > SUMMARY_FIELD_CAP ? `, +${rows.length - SUMMARY_FIELD_CAP} more` : '';
  return parts.join(', ') + extra;
}

const SOURCE_LABELS: Record<string, string> = {
  'azure-jit': 'Auto-created on first Microsoft sign-in',
  'password-registration': 'Self-registered with email + password',
  'azure-link': 'Linked to a Microsoft account',
  'password-link': 'Enabled email + password sign-in',
};

/**
 * Human-readable metadata rows (requestId is kept out — it's a support ref).
 * `source: 'app'` is the default on nearly every write (see
 * prisma.extensions.ts's baseMetadata) — true for almost every row, so
 * showing "How: app" is noise, not information. Only the handful of
 * genuinely notable sources (how a *Consultant account* came to exist) are
 * worth a row; "made through the app" is the unremarkable default case and
 * is simply omitted.
 */
export function metadataRows(metadata: unknown): { label: string; value: string }[] {
  if (metadata == null || typeof metadata !== 'object') return [];
  const m = metadata as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  if (typeof m.source === 'string' && SOURCE_LABELS[m.source]) {
    rows.push({ label: 'How', value: SOURCE_LABELS[m.source] });
  }
  if (m.cascade) {
    const count = typeof m.count === 'number' ? ` (${m.count} record${m.count === 1 ? '' : 's'})` : '';
    rows.push({ label: 'Part of', value: `A bulk action${count}` });
  }
  return rows;
}

export function requestIdOf(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object') return null;
  const id = (metadata as Record<string, unknown>).requestId;
  return typeof id === 'string' ? id : null;
}

/**
 * The entityId, but only when it's a real id.
 *
 * The write side stores two sentinels in that column rather than null:
 * "(unknown)" for a model with no single `id` column (ConsultantIndustry's
 * composite key) and "(bulk)" for a deleteMany/updateMany that touched many
 * rows at once — see prisma.extensions.ts's writeAudit. Neither is something
 * anyone can look up, so the UI must not offer them as a copyable reference:
 * a labelled row reading "Record ID: (unknown)" looks like a bug, where the
 * honest answer is that this kind of record simply doesn't have one.
 */
export function realEntityId(entityId: string): string | null {
  if (!entityId || entityId === '(unknown)' || entityId === '(bulk)') return null;
  return entityId;
}

const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2 hours ago" / "yesterday" — the part of a timestamp people actually reason about, shown alongside (never instead of) the exact date. */
export function relativeTime(iso: string | Date, now: number = Date.now()): string {
  const delta = new Date(iso).getTime() - now;
  const abs = Math.abs(delta);
  if (Number.isNaN(delta)) return '';
  if (abs < 45 * 1000) return 'just now';
  if (abs < 45 * MINUTE) return relative.format(Math.round(delta / MINUTE), 'minute');
  if (abs < 22 * HOUR) return relative.format(Math.round(delta / HOUR), 'hour');
  if (abs < 26 * DAY) return relative.format(Math.round(delta / DAY), 'day');
  if (abs < 320 * DAY) return relative.format(Math.round(delta / (30 * DAY)), 'month');
  return relative.format(Math.round(delta / (365 * DAY)), 'year');
}
