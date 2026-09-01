import {
  Archive,
  ArchiveRestore,
  Download,
  PencilLine,
  Plus,
  Trash2,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';

import type { AuditLogEntity, ResolvedChange, ResolvedValue } from '@/lib/api/generated/types';
import { GetAuditLogsAction } from '@/lib/api/generated/types';

export type AuditLog = AuditLogEntity;

/** Badge variants this feature spends. `warning` and `info` are both real variants (see badge.tsx). */
type ActionVariant = 'success' | 'secondary' | 'warning' | 'info' | 'destructive' | 'outline';

/**
 * Everything that distinguishes one kind of activity from another, in one
 * place.
 *
 * This used to be four parallel maps across two files — labels and variants
 * here, icons and narratives elsewhere — and they had already drifted: EXPORT
 * had a label and a colour but no narrative and no icon, so 15% of the real
 * log (40 of 265 rows, all exports) rendered as "…changed this client" under
 * a pencil. One map with one required shape per action makes that class of
 * gap a type error instead of a silent lie.
 *
 * `verb` is completed by the actor and the subject: "Joe Lim {verb} {subject}."
 * It takes the subject as a parameter rather than baking in "this {type}"
 * because the subject is "this client" for one record and "11 stakeholders"
 * for a bulk row — the same sentence has to work for both.
 */
export interface ActionSpec {
  label: string;
  variant: ActionVariant;
  Icon: LucideIcon;
  verb: (subject: string, plural: boolean) => string;
  /**
   * Heading for the field list. Three genuinely different things wear this
   * heading — a real before→after diff, the values a record started life
   * with, and the last surviving copy of a row that no longer exists — so
   * calling them all "changes" misleads. `bulk` is a separate string because
   * a bulk write has no "before" side to show at all (see `presentRow`'s
   * updateMany branch): the fields are what every matched row was set *to*.
   */
  fieldsHeading: { single: string; bulk: string } | null;
  /** The "should I care" line. `null` where the fields already say everything. */
  consequence: ((plural: boolean) => string) | null;
  /** Whether the consequence is a warning worth colour, or just a note. */
  severe: boolean;
}

const ACTION_SPEC: Record<string, ActionSpec> = {
  CREATE: {
    label: 'Created',
    variant: 'success',
    Icon: Plus,
    verb: (subject) => `added ${subject}`,
    fieldsHeading: { single: 'What was filled in', bulk: 'What each record was created with' },
    consequence: null,
    severe: false,
  },
  UPDATE: {
    label: 'Updated',
    variant: 'secondary',
    Icon: PencilLine,
    verb: (subject) => `edited ${subject}`,
    fieldsHeading: { single: 'What changed', bulk: 'What was set on every record' },
    consequence: null,
    severe: false,
  },
  SOFT_DELETE: {
    // Amber, not red. Archiving is recoverable; HARD_DELETE is not. Both
    // shared `destructive` before, which spent the strongest colour in the
    // palette on the reversible action and left nothing louder for the
    // irreversible one.
    label: 'Archived',
    variant: 'warning',
    Icon: Archive,
    verb: (subject) => `archived ${subject}`,
    fieldsHeading: { single: 'What changed', bulk: 'What was set on every record' },
    consequence: (plural) =>
      plural
        ? 'They no longer show up in lists or searches, but nothing was lost — they can be restored.'
        : 'It no longer shows up in lists or searches, but nothing was lost — it can be restored.',
    severe: false,
  },
  RESTORE: {
    label: 'Restored',
    variant: 'success',
    Icon: ArchiveRestore,
    verb: (subject) => `restored ${subject}`,
    fieldsHeading: { single: 'What changed', bulk: 'What was set on every record' },
    consequence: (plural) =>
      plural
        ? 'They are back in lists and searches as they were before.'
        : 'It is back in lists and searches as it was before.',
    severe: false,
  },
  DEACTIVATE: {
    label: 'Deactivated',
    variant: 'warning',
    Icon: UserRoundX,
    verb: (subject, plural) => (plural ? `deactivated ${subject}` : 'deactivated this account'),
    fieldsHeading: { single: 'What changed', bulk: 'What was set on every account' },
    consequence: (plural) =>
      plural
        ? 'These people can no longer sign in. The records they own are untouched.'
        : 'This person can no longer sign in. The records they own are untouched.',
    severe: false,
  },
  HARD_DELETE: {
    // The only action left wearing `destructive` — so red now means exactly
    // one thing on this page: gone for good.
    label: 'Deleted',
    variant: 'destructive',
    Icon: Trash2,
    verb: (subject) => `permanently deleted ${subject}`,
    fieldsHeading: {
      single: 'What the record held when it was deleted',
      bulk: 'What these records held when they were deleted',
    },
    consequence: () => 'This cannot be undone — this activity entry is the only remaining record of it.',
    severe: true,
  },
  EXPORT: {
    label: 'Exported',
    variant: 'info',
    Icon: Download,
    verb: (subject) => `exported ${subject}`,
    // An export reads; it writes nothing. There is no field list, and saying
    // "no field-by-field detail was recorded" (what the generic path used to
    // print here) reads as data missing rather than as nothing having changed.
    fieldsHeading: null,
    consequence: () =>
      'This created a downloadable copy outside the system. No records were changed.',
    severe: false,
  },
};

const FALLBACK_SPEC: ActionSpec = {
  label: 'Changed',
  variant: 'outline',
  Icon: PencilLine,
  verb: (subject) => `changed ${subject}`,
  fieldsHeading: { single: 'What changed', bulk: 'What was set on every record' },
  consequence: null,
  severe: false,
};

export function actionSpec(action: string): ActionSpec {
  return ACTION_SPEC[action] ?? FALLBACK_SPEC;
}

export const auditActions = Object.values(GetAuditLogsAction);

export const actionFilterOptions = auditActions.map((value) => ({
  value,
  label: actionSpec(value).label,
  variant: actionSpec(value).variant,
}));

// ---------------------------------------------------------------------------
// Scope: one record, or many?
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * Plural form of an entity label. The generic rules cover the whole catalog
 * ("Client" → "Clients", "Industry Assignment" → "Industry Assignments"); the
 * overrides are the labels those rules get wrong, which are the ones that are
 * already mass nouns or already plural.
 */
const PLURAL_OVERRIDES: Record<string, string> = {
  'Terms of Business': 'Terms of Business',
  'Job Research': 'Job Research',
  'Candidate Contact History': 'Candidate Contact History',
  'Stakeholder Contact History': 'Stakeholder Contact History',
};

export function pluralize(label: string, count: number): string {
  if (count === 1) return label;
  const override = PLURAL_OVERRIDES[label];
  if (override) return override;
  if (/s$/i.test(label)) return label;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

export interface ActivityScope {
  /** True when this entry stands for a set of records, not one. */
  isBulk: boolean;
  /** How many records were touched, when the write side recorded it. */
  count: number | null;
  /** Set when this happened automatically as a consequence of a parent record going — e.g. archiving a client archives its stakeholders. */
  cascadedFromType: string | null;
  /** Export only: the rows were named explicitly rather than matched by a filter. */
  explicitSelection: boolean;
  /** Export only: a filter was active, so this is a subset rather than the whole list. */
  filtered: boolean;
}

/**
 * How much this one entry covers.
 *
 * The `'(bulk)'` entityId sentinel is the write side's marker for a
 * `deleteMany`/`updateMany` or an export (see prisma.extensions.ts's
 * writeAudit and common/audit-export.ts) — there is no single row behind it,
 * so anything that reads "this candidate" off such an entry is wrong by a
 * factor of `count`. Real rows in this table run to 1,645.
 */
export function describeScope(entry: Pick<AuditLog, 'entityId' | 'action' | 'metadata'>): ActivityScope {
  const m = (entry.metadata != null && typeof entry.metadata === 'object' ? entry.metadata : {}) as Record<
    string,
    unknown
  >;
  const count = typeof m.count === 'number' ? m.count : null;
  const cascadedFrom = m.cascadedFrom;
  const cascadedFromType =
    cascadedFrom != null && typeof cascadedFrom === 'object' && typeof (cascadedFrom as { model?: unknown }).model === 'string'
      ? (cascadedFrom as { model: string }).model
      : null;
  const filters = m.filters;
  return {
    isBulk: entry.entityId === '(bulk)',
    count,
    cascadedFromType,
    explicitSelection: Array.isArray(m.requestedIds),
    filtered:
      filters != null &&
      typeof filters === 'object' &&
      Object.values(filters as Record<string, unknown>).some(
        (v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0),
      ),
  };
}

/**
 * What this entry is *about*, as a name a person can read — the sheet heading
 * and the table's Record cell both come from here so they can't disagree.
 *
 * A bulk entry names its size ("11 Stakeholders"), never the singular fallback
 * the single-record path uses.
 */
export function describeRecord(
  entry: Pick<AuditLog, 'entityId' | 'action' | 'metadata' | 'entityLabel' | 'entityTypeLabel'>,
  scope: ActivityScope = describeScope(entry),
): { title: string; typeLabel: string; named: boolean } {
  if (scope.isBulk) {
    const typeLabel = pluralize(entry.entityTypeLabel, scope.count ?? 2);
    const title =
      scope.count != null ? `${numberFormat.format(scope.count)} ${typeLabel}` : `A group of ${typeLabel}`;
    return { title, typeLabel, named: false };
  }
  if (entry.entityLabel) return { title: entry.entityLabel, typeLabel: entry.entityTypeLabel, named: true };
  return {
    title: `A ${entry.entityTypeLabel.toLowerCase()} record`,
    typeLabel: entry.entityTypeLabel,
    named: false,
  };
}

/** The subject of the action sentence — "this client", "11 stakeholders", "1,645 clients". */
function actionSubject(entry: AuditLog, scope: ActivityScope): string {
  if (!scope.isBulk) return `this ${entry.entityTypeLabel.toLowerCase()}`;
  const typeLabel = pluralize(entry.entityTypeLabel, scope.count ?? 2).toLowerCase();
  return scope.count != null ? `${numberFormat.format(scope.count)} ${typeLabel}` : `a group of ${typeLabel}`;
}

/** "Joe Lim exported 1,645 clients" — the one-line answer to "what happened here". */
export function activitySentence(entry: AuditLog, scope: ActivityScope = describeScope(entry)): string {
  const plural = scope.isBulk && (scope.count ?? 2) !== 1;
  return `${describeActor(entry).name} ${actionSpec(entry.action).verb(actionSubject(entry, scope), plural)}`;
}

/**
 * Why this happened, when it wasn't someone acting on this record directly.
 * A cascaded archive is the common case: eleven stakeholders went because
 * their client did, and without this line the entry looks like someone
 * archived eleven people one afternoon for no stated reason.
 */
export function scopeExplanation(
  entry: AuditLog,
  scope: ActivityScope = describeScope(entry),
): string | null {
  if (scope.cascadedFromType) {
    return `Applied automatically because the ${entityTypeLabelOf(scope.cascadedFromType).toLowerCase()} it belonged to was archived.`;
  }
  // An export says how its set was chosen inside its own "what was exported"
  // block, next to the records themselves — a separate sentence up here only
  // restated it further from the thing it describes.
  if (entry.action === 'EXPORT') return null;
  if (scope.isBulk) return 'Applied in one action to every record matching the filter at the time.';
  return null;
}

/**
 * Which criteria an export was narrowed by, named.
 *
 * The stored filter object holds ids, which are not worth resolving here (they
 * belong to whichever grid ran the export, not to this page) — but the *keys*
 * say something genuinely useful: "filtered by Location" tells a reader this
 * was a slice, and which slice, without pretending to more precision than the
 * metadata carries.
 */
const FILTER_KEY_LABELS: Record<string, string> = {
  q: 'Search',
  search: 'Search',
  statuses: 'Status',
  qualities: 'Quality',
  locationIds: 'Location',
  industryIds: 'Industry',
  specializationIds: 'Specialization',
  jobRoleTypeIds: 'Role type',
  roleTypeIds: 'Role type',
  consultantIds: 'Consultant',
  clientIds: 'Client',
};

/** Params that describe how the export was ordered or paged, not what it contained. */
const NON_FILTER_KEYS = new Set(['sortBy', 'sortOrder', 'page', 'pageSize', 'timezone']);

function filterKeyLabel(key: string): string {
  const known = FILTER_KEY_LABELS[key];
  if (known) return known;
  const base = key.replace(/Ids$/, '').replace(/Id$/, '');
  const spaced = base.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function exportFilterLabels(metadata: unknown): string[] {
  if (metadata == null || typeof metadata !== 'object') return [];
  const filters = (metadata as Record<string, unknown>).filters;
  if (filters == null || typeof filters !== 'object') return [];
  return Object.entries(filters as Record<string, unknown>)
    .filter(
      ([key, value]) =>
        !NON_FILTER_KEYS.has(key) &&
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    )
    .map(([key]) => filterKeyLabel(key));
}

/**
 * Friendly name for a raw model name. Every *row* carries its own
 * `entityTypeLabel` from the API and should use that — this is only for the
 * handful of places holding a bare model name with no row attached, i.e. the
 * `cascadedFrom.model` inside metadata.
 */
const ENTITY_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  JobOrder: 'Job Order',
  CandidateSubmission: 'Submission',
  ClientJobResearch: 'Job Research',
  ConsultantIndustry: 'Industry Assignment',
  JobOrderConsultant: 'Consultant Assignment',
  Tob: 'Terms of Business',
};

export function entityTypeLabelOf(entityType: string): string {
  return ENTITY_TYPE_LABEL_OVERRIDES[entityType] ?? entityType.replace(/([A-Z])/g, ' $1').trim();
}

export interface ExportDetail {
  /** "1,528 clients" — what left the system. */
  what: string;
  /** How that set was chosen, in one clause. */
  how: string;
  /** The records themselves, when the export named them explicitly (see AuditLogEntity.affectedRecords). */
  records: string[];
  /** True when more records were named than the API resolved labels for. */
  truncated: boolean;
}

/** Everything an export entry has to say. Null for every other action. */
export function exportDetail(
  entry: AuditLog,
  scope: ActivityScope = describeScope(entry),
): ExportDetail | null {
  if (entry.action !== 'EXPORT') return null;
  const count = scope.count;
  const what =
    count == null
      ? `${pluralize(entry.entityTypeLabel, 2).toLowerCase()}`
      : `${numberFormat.format(count)} ${pluralize(entry.entityTypeLabel, count).toLowerCase()}`;

  const records = entry.affectedRecords ?? [];
  const filterLabels = exportFilterLabels(entry.metadata);

  const how = scope.explicitSelection
    ? 'chosen one by one'
    : filterLabels.length > 0
      ? `everything matching ${filterLabels.join(' + ')} at the time`
      : 'the whole list, unfiltered';

  return { what, how, records, truncated: count != null && records.length > 0 && count > records.length };
}

/**
 * The records a non-export entry names, when it names them.
 *
 * A bulk write now records the ids it touched, so an archive that used to say
 * only "3 stakeholders" can say which three. Null for an ordinary
 * single-record write, where the heading already is the record.
 */
export function affectedRecords(entry: AuditLog, scope: ActivityScope = describeScope(entry)): string[] {
  if (entry.action === 'EXPORT' || !scope.isBulk) return [];
  return entry.affectedRecords ?? [];
}

/** Whether this entry's own record list is shorter than the number it covers. */
export function affectedTruncated(entry: AuditLog, scope: ActivityScope = describeScope(entry)): boolean {
  const named = affectedRecords(entry, scope).length;
  return named > 0 && scope.count != null && scope.count > named;
}

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

/**
 * Who to name as the actor. A null name with a non-null id means the
 * consultant record behind it is gone (hard-purged) — say that in words and
 * keep the id as a footnote, rather than printing a raw uuid where a person's
 * name should be.
 */
export function describeActor(entry: Pick<AuditLog, 'actorName' | 'actorId'>): {
  name: string;
  unresolvedId: string | null;
} {
  if (entry.actorName) return { name: entry.actorName, unresolvedId: null };
  if (entry.actorId) return { name: 'Unknown user', unresolvedId: entry.actorId };
  return { name: 'The system', unresolvedId: null };
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * A timestamp inside a field value, in the reader's own timezone.
 *
 * The API hands these over as raw instants with no label (`kind: "date"`)
 * precisely so this happens here — formatting them server-side rendered them
 * in the *server's* zone on a 24-hour clock, which meant an entry could show
 * its own headline time locally and a date inside it hours out.
 */
const valueDateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function valueDate(raw: unknown): string {
  if (typeof raw !== 'string') return rawText(raw);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : tidyMeridiem(valueDateFormat.format(d));
}

/**
 * A raw value as text, for the case where the API resolved no label.
 *
 * `String()` on an object yields the literal "[object Object]". The API now
 * summarises structured values before they get here, so this is a backstop
 * against a shape it hasn't met — but it is the difference between a degraded
 * label and a visible bug, so it stays.
 */
export function rawText(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'object') return Array.isArray(raw) ? `${raw.length} items` : 'details not recorded';
  return String(raw);
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
 * decides how a redacted/deleted/unresolved value *reads*. The detail sheet
 * makes the same three decisions as markup off the same predicates, so the
 * two can't disagree on meaning.
 */
export function displayValue(v: ResolvedValue): string {
  if (v.redacted) return 'hidden';
  if (isEmptyValue(v)) return 'empty';
  const base = v.kind === 'date' ? valueDate(v.raw) : (v.label ?? rawText(v.raw));
  // "archived", not "deleted" — the flag means soft-deleted, and the action
  // labels already reserve "Deleted" for the irreversible HARD_DELETE.
  return v.deleted ? `${base} (archived)` : base;
}

/** Whether a resolved value's "from" side is worth showing at all — a CREATE's pseudo-diff always has an empty `from` (see the backend's audit-presenter.ts), so it should render as "Field: value", not "Field: empty → value". */
export function hasPreviousValue(v: ResolvedValue): boolean {
  return v.redacted === true || v.raw != null || v.label != null;
}

/**
 * The one field worth showing in a table cell, plus how many were left over.
 *
 * The old Changes column joined up to four fields into a single string and
 * truncated it, which put the most informative column on the page behind a
 * hover — unreadable on a first pass, and invisible to anyone not using a
 * mouse. One field rendered properly beats four fields rendered as an
 * ellipsis, and the full list is one click away in the sheet either way.
 */
export function previewChange(rows: ResolvedChange[] | null): { row: ResolvedChange; more: number } | null {
  if (!rows || rows.length === 0) return null;
  return { row: rows[0], more: rows.length - 1 };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  'azure-jit': 'Auto-created on first Microsoft sign-in',
  'password-registration': 'Self-registered with email + password',
  'azure-link': 'Linked to a Microsoft account',
  'password-link': 'Enabled email + password sign-in',
};

/**
 * The residual context rows — how a Consultant account came to exist, and
 * nothing else.
 *
 * Scope (bulk counts, cascades, how an export's set was chosen) used to live
 * here too and therefore rendered at the very bottom of the sheet, below the
 * field list. That is backwards: "this touched 1,645 records" changes what
 * the whole entry means and now leads, via `describeRecord`/`scopeExplanation`.
 * `source: 'app'` stays omitted — it's true of nearly every row, so showing
 * it is noise.
 */
export function metadataRows(metadata: unknown): { label: string; value: string }[] {
  if (metadata == null || typeof metadata !== 'object') return [];
  const m = metadata as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  if (typeof m.source === 'string' && SOURCE_LABELS[m.source]) {
    rows.push({ label: 'How', value: SOURCE_LABELS[m.source] });
  }
  return rows;
}

/**
 * The entityId, but only when it's a real id.
 *
 * The write side stores two sentinels in that column rather than null:
 * "(unknown)" for a model with no single `id` column (ConsultantIndustry's
 * composite key) and "(bulk)" for a deleteMany/updateMany that touched many
 * rows at once. Neither is something anyone can look up, so the UI must not
 * offer them as a copyable reference: a labelled row reading
 * "Record ID: (unknown)" looks like a bug, where the honest answer is that
 * this kind of record simply doesn't have one.
 */
export function realEntityId(entityId: string): string | null {
  if (!entityId || entityId === '(unknown)' || entityId === '(bulk)') return null;
  return entityId;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

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

/**
 * Every timestamp on this page is rendered in the reader's own timezone —
 * `Intl.DateTimeFormat` with no explicit `timeZone` uses the runtime's, and
 * the API sends UTC instants. `hour12` is set explicitly because en-GB
 * defaults to the 24-hour clock, which had entries reading "23:37" where the
 * people using this say "11:37pm".
 */
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };

const timeOnly = new Intl.DateTimeFormat('en-GB', TIME_OPTS);
const dayAndTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...TIME_OPTS });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Weekday included on purpose: "Thu" is how people remember when something
// happened; the date alone makes them count back. The zone is named because
// an audit trail gets read across offices, and "6:10pm" is only a fact if you
// know whose 6:10pm it was.
const fullDateTime = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  ...TIME_OPTS,
  timeZoneName: 'short',
});

/** "6:10 pm" → "6:10pm". Handles the narrow no-break space ICU uses in some builds. */
function tidyMeridiem(text: string): string {
  return text.replace(/[\s\u202f\u00a0]*(a\.?m\.?|p\.?m\.?)/i, (_, marker: string) =>
    marker.replace(/\./g, '').toLowerCase(),
  );
}

/**
 * The exact-time line under the relative one in the table. Same day → the
 * clock time is all that's needed; this year → day + time; older → the date,
 * where the time has stopped being the interesting part.
 */
export function exactTimeLabel(iso: string | Date, now: Date = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return tidyMeridiem(timeOnly.format(d));
  if (d.getFullYear() === now.getFullYear()) return tidyMeridiem(dayAndTime.format(d));
  return dayMonthYear.format(d);
}

/** The unambiguous timestamp: weekday, full date, local time, and which zone that is. */
export function fullTimestamp(iso: string | Date): string {
  return tidyMeridiem(fullDateTime.format(new Date(iso)));
}

/**
 * A calendar date (`YYYY-MM-DD` from a native date input) widened to the
 * instants that bound that whole day *in the reader's own timezone*.
 *
 * Sending the bare date meant `to` became midnight at the *start* of the day,
 * so "up to today" silently returned nothing from today — the single most
 * expensive failure mode this tool has, per its own design principles: a
 * wrong result set that looks right.
 */
export function dayStartIso(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function dayEndIso(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** Local `YYYY-MM-DD` for a date `offsetDays` from today — what the presets and the date inputs speak. */
export function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
