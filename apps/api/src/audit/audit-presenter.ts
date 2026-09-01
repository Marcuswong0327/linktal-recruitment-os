import type { AuditLog as RawAuditLog } from '@prisma/client';
import { booleanLabel, describeField, entityTypeLabel, enumLabel, fieldLabel, LABEL_SPEC, SENSITIVE_FIELDS } from './audit-schema.map';
import type { LabelMap, LabelRequest } from './label-resolver.service';
import type { ResolvedChange, ResolvedValue } from './entities/resolved-change.entity';

// Bookkeeping fields never worth surfacing as a "change" — the Action badge
// already conveys create/delete/restore, and timestamps aren't meaningful
// reading. Applied uniformly across diffs, CREATE snapshots and HARD_DELETE
// before-images.
const HIDDEN_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedById']);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

/** How many of an entry's named records to resolve and show. Past a handful the list stops being readable and the count is the useful fact. */
export const AFFECTED_LABEL_CAP = 8;

/** How many names from an id-array to spell out before summarising the rest as a count. */
const FK_LIST_CAP = 20;

function isDiffShape(v: unknown): v is { from?: unknown; to?: unknown } {
  return v != null && typeof v === 'object' && !Array.isArray(v) && ('from' in v || 'to' in v);
}

/**
 * Walks every audit row's entityType/entityId, actorId, `changes` and
 * `metadata.where`, adding every id worth resolving into one shared
 * LabelRequest — so a whole page of rows costs one query per distinct
 * *target model*, not one per row or one per field.
 */
export function collectRefs(rows: RawAuditLog[], into: LabelRequest): void {
  const add = (model: string, id: string | null | undefined) => {
    if (!id || !LABEL_SPEC[model]) return;
    let set = into.get(model);
    if (!set) {
      set = new Set();
      into.set(model, set);
    }
    set.add(id);
  };

  for (const row of rows) {
    // '(bulk)' is the sentinel a bulk write uses in place of a real entityId
    // (see writeAudit's deleteMany/updateMany path) — never a resolvable id.
    if (row.entityId !== '(bulk)') add(row.entityType, row.entityId);
    add('Consultant', row.actorId);

    const changes = row.changes;
    if (changes != null && typeof changes === 'object' && !Array.isArray(changes)) {
      for (const [field, raw] of Object.entries(changes as Record<string, unknown>)) {
        const meta = describeField(row.entityType, field);
        if (meta.kind === 'fk-list') {
          const sides = isDiffShape(raw) ? [raw.from, raw.to] : [raw];
          for (const side of sides) {
            if (!Array.isArray(side)) continue;
            for (const id of side) if (typeof id === 'string') add(meta.targetType, id);
          }
          continue;
        }
        if (meta.kind !== 'fk') continue;
        if (isDiffShape(raw)) {
          if (typeof raw.from === 'string') add(meta.targetType, raw.from);
          if (typeof raw.to === 'string') add(meta.targetType, raw.to);
        } else if (typeof raw === 'string') {
          add(meta.targetType, raw);
        }
      }
    }

    const metadata = row.metadata;
    if (metadata != null && typeof metadata === 'object') {
      const m = metadata as Record<string, unknown>;
      if ('where' in m) collectFromWhere(row.entityType, m.where, add, 0);
      // The rows an entry actually covers, when it named them: `requestedIds`
      // on a hand-picked export, `ids` on a bulk write. Resolving them is what
      // lets an entry say "Acme Pty Ltd" instead of only "1 client".
      for (const ids of [m.requestedIds, m.ids]) {
        if (!Array.isArray(ids)) continue;
        for (const id of ids.slice(0, AFFECTED_LABEL_CAP)) {
          if (typeof id === 'string') add(row.entityType, id);
        }
      }
    }
  }
}

/** Bounded walk of a bulk write's captured `where` clause — understands the shapes Prisma actually generates (`{field: v}`, `{field: {equals: v}}`, `{field: {in: [...]}}`, `AND`/`OR`/`NOT`); anything else is silently skipped, never thrown on. */
function collectFromWhere(
  entityType: string,
  where: unknown,
  add: (model: string, id: string) => void,
  depth: number,
): void {
  if (depth > 5 || where == null || typeof where !== 'object') return;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      const list = Array.isArray(value) ? value : [value];
      for (const v of list) collectFromWhere(entityType, v, add, depth + 1);
      continue;
    }
    const meta = describeField(entityType, key);
    if (meta.kind !== 'fk') continue;
    if (typeof value === 'string') {
      add(meta.targetType, value);
    } else if (value != null && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      if (typeof v.equals === 'string') add(meta.targetType, v.equals);
      if (Array.isArray(v.in)) {
        for (const id of v.in) if (typeof id === 'string') add(meta.targetType, id);
      }
    }
  }
}

/** Longest a summarised object/array value may get before it stops being a table cell and starts being a paragraph. */
const STRUCTURED_MAX = 160;

/**
 * A readable one-liner for an object or array value.
 *
 * `String(raw)` on anything non-scalar yields the literal text
 * "[object Object]" — which is what a CREATE snapshot's relation payloads and
 * every JSONB column (Candidate.workHistory, Candidate.notes,
 * Client.addresses) rendered as. Objects are summarised from their own
 * string-ish leaves rather than dumped as JSON, because the reader is an
 * admin, not a developer.
 */
function formatStructured(raw: unknown): string | null {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const parts = raw.map((v) => (v != null && typeof v === 'object' ? summarizeObject(v as Record<string, unknown>) : scalarText(v)));
    const kept = parts.filter((p): p is string => p != null);
    return kept.length > 0 ? truncate(kept.join('; ')) : `${raw.length} item${raw.length === 1 ? '' : 's'}`;
  }
  const summary = summarizeObject(raw as Record<string, unknown>);
  return summary ? truncate(summary) : null;
}

function scalarText(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return null;
  return String(v);
}

/** Keys whose value is an identifier or an authorship stamp — machinery, not content. */
const ID_KEY = /^(id|_id|by|.*Id|.*By)$/;
/** cuid or uuid — an identifier wherever it turns up, whatever its key is called. */
const ID_VALUE = /^(c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * An object's own *meaningful* scalar leaves.
 *
 * Dumping every leaf turned a candidate note — `{id, content, timestamp, by,
 * editedAt, editedBy}` — into "cmsebvyeo0004… · fa4ccdd0-d3ab-… · Very
 * unprofessional · 2026-08-11T14:47:08.181Z", where the only part anyone
 * wanted was three words in the middle. Identifiers and timestamps are
 * dropped: the entry already carries its own when and who, and no reader has
 * ever needed a note's internal uuid.
 */
function summarizeObject(obj: Record<string, unknown>): string | null {
  const parts = Object.entries(obj)
    .filter(([key, value]) => !ID_KEY.test(key) && !(typeof value === 'string' && ID_VALUE.test(value)))
    .filter(([, value]) => !(typeof value === 'string' && ISO_DATE.test(value)))
    .map(([, value]) => scalarText(value))
    .filter((v): v is string => v != null);
  // De-duplicated: an outreach recipient stores the same address under two
  // keys, and "…@linktal.com.au · Marcus · …@linktal.com.au" reads like a bug.
  return parts.length > 0 ? [...new Set(parts)].join(' · ') : null;
}

function truncate(text: string): string {
  return text.length > STRUCTURED_MAX ? `${text.slice(0, STRUCTURED_MAX - 1)}…` : text;
}

function formatPlain(field: string, raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'boolean') return booleanLabel(field, raw);
  if (typeof raw === 'object') return formatStructured(raw);
  return String(raw);
}

/** True for a value the client should render as a moment in the reader's own timezone. */
function isIsoInstant(raw: unknown): raw is string {
  return typeof raw === 'string' && ISO_DATE.test(raw);
}

/**
 * Relation payloads a create/update snapshot carried alongside its own
 * columns — `client: { companyName: "…" }` sitting next to `clientId`.
 *
 * They are duplicates, not extra information: the scalar FK beside them is
 * already resolved to a full label (displayId + name), so keeping both
 * printed the same relationship twice under the same field label, once
 * properly and once as "[object Object]". Dropped, rather than counted as
 * omitted — nothing is being hidden, the sibling says it better.
 */
function relationPayloadFields(entries: [string, unknown][]): Set<string> {
  const present = new Set(entries.map(([field]) => field));
  const drop = new Set<string>();
  for (const [field, value] of entries) {
    const isObjectish = value != null && typeof value === 'object';
    if (!isObjectish) continue;
    if (Array.isArray(value)) continue;
    if (present.has(`${field}Id`)) drop.add(field);
  }
  return drop;
}

function resolveValue(model: string, field: string, raw: unknown, labels: LabelMap, redact: boolean): ResolvedValue {
  if (redact) return { raw: null, label: null, kind: 'plain', redacted: true };

  const meta = describeField(model, field);
  if (meta.kind === 'fk-list') {
    if (!Array.isArray(raw)) return { raw: raw ?? null, label: null, kind: 'fk-list', targetType: meta.targetType };
    const names = raw
      .map((id) => (typeof id === 'string' ? (labels.get(`${meta.targetType}:${id}`)?.label ?? null) : null))
      .filter((label): label is string => label != null);
    // An id that resolved to nothing is counted, not printed: "and 2 more"
    // is honest about the gap where a raw cuid would just look like a bug.
    const unresolved = raw.length - names.length;
    const shown = names.slice(0, FK_LIST_CAP);
    const hidden = names.length - shown.length + unresolved;
    const label =
      raw.length === 0
        ? null
        : shown.join(', ') + (hidden > 0 ? `${shown.length > 0 ? ', ' : ''}and ${hidden} more` : '');
    return { raw, label, kind: 'fk-list', targetType: meta.targetType };
  }
  if (meta.kind === 'fk') {
    if (typeof raw !== 'string') {
      return { raw: raw ?? null, label: null, kind: 'fk', targetType: meta.targetType };
    }
    const resolved = labels.get(`${meta.targetType}:${raw}`);
    return {
      raw,
      label: resolved?.label ?? null,
      kind: 'fk',
      targetType: meta.targetType,
      deleted: resolved?.deleted,
    };
  }
  if (meta.kind === 'enum') {
    return { raw: raw ?? null, label: typeof raw === 'string' ? enumLabel(meta.enumName, raw) : null, kind: 'enum' };
  }
  // A timestamp is handed over as the raw instant with no label, for the
  // client to format. Formatting it here rendered every nested date (an
  // interview date, a "contacted at") in the *server's* timezone and on a
  // 24-hour clock — so one entry could show its own headline time in the
  // reader's local 12-hour time and a field inside it eight hours out.
  if (isIsoInstant(raw)) return { raw, label: null, kind: 'date' };
  return { raw: raw ?? null, label: formatPlain(field, raw), kind: 'plain' };
}

function buildChangeRow(
  model: string,
  field: string,
  from: unknown,
  to: unknown,
  labels: LabelMap,
  isAdmin: boolean,
): ResolvedChange {
  const redact = !isAdmin && SENSITIVE_FIELDS[model]?.has(field) === true;
  return {
    field,
    fieldLabel: fieldLabel(field),
    from: resolveValue(model, field, from, labels, redact),
    to: resolveValue(model, field, to, labels, redact),
  };
}

/**
 * A last-resort label for a row whose own entity couldn't be resolved —
 * either it's genuinely gone (hard-purged), or (the common case in
 * practice) its model has no single `id` to resolve at all, like
 * ConsultantIndustry's `@@id([consultantId, industryId])` composite key,
 * which the write-side extension records as the literal entityId
 * "(unknown)" (see prisma.extensions.ts). Rather than showing that raw
 * placeholder, build a label out of whatever FK fields the diff itself
 * already resolved — for a ConsultantIndustry row that's the consultant and
 * the industry it names, which is exactly what an admin wants to see.
 */
function synthesizeLabel(resolvedChanges: ResolvedChange[] | null): string | null {
  if (!resolvedChanges) return null;
  const parts = resolvedChanges
    .filter((c) => c.to.kind === 'fk' && c.to.label)
    .slice(0, 2)
    .map((c) => c.to.label as string);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * A consultant label without its `CST-000###` prefix.
 *
 * The displayId earns its place where a consultant appears as a *field value*
 * (two people can share a name, and support quotes the id), but as the actor
 * of a sentence it just pushes the name off the front: "CST-000016 · Jack Chan
 * edited this submission" reads as a reference number that happens to have a
 * person attached.
 */
const DISPLAY_ID_PREFIX = /^[A-Z]{2,4}-\d{4,}\s+·\s+/;

function actorDisplayName(label: string | undefined): string | null {
  if (!label) return null;
  const stripped = label.replace(DISPLAY_ID_PREFIX, '');
  return stripped.trim() === '' ? label : stripped;
}

export interface PresentedRow {
  resolvedChanges: ResolvedChange[] | null;
  /** How many raw fields a CREATE snapshot dropped as noise (nulls, ids, timestamps) — lets the UI offer "show all fields" instead of silently hiding data. */
  omittedFieldCount: number;
  entityTypeLabel: string;
  entityLabel: string | null;
  entityDeleted: boolean;
  actorName: string | null;
  /** The records this entry covers, resolved to labels — a hand-picked export's selection, or the rows a bulk write touched. Null when the entry doesn't name them. */
  affectedRecords: string[] | null;
}

/**
 * Builds the presentation layer for one row, given a LabelMap already
 * resolved for the whole page (see LabelResolverService). `isAdmin` gates
 * SENSITIVE_FIELDS redaction — audit:read is admin-only today, but this
 * keeps it that way even if that permission is ever granted more broadly.
 */
export function presentRow(row: RawAuditLog, labels: LabelMap, isAdmin: boolean): PresentedRow {
  const entityResolved = row.entityId !== '(bulk)' ? labels.get(`${row.entityType}:${row.entityId}`) : undefined;
  const actorResolved = row.actorId ? labels.get(`Consultant:${row.actorId}`) : undefined;

  const changes = row.changes;
  let resolvedChanges: ResolvedChange[] | null = null;
  let omittedFieldCount = 0;

  if (changes != null && typeof changes === 'object' && !Array.isArray(changes)) {
    const allEntries = Object.entries(changes as Record<string, unknown>);
    const dropped = relationPayloadFields(allEntries);
    const entries = allEntries.filter(([field]) => !dropped.has(field));
    const isDiff = entries.length > 0 && entries.every(([, v]) => isDiffShape(v));

    if (isDiff) {
      // UPDATE / SOFT_DELETE / RESTORE / DEACTIVATE — a real before -> after diff.
      resolvedChanges = entries
        .filter(([field]) => !HIDDEN_FIELDS.has(field))
        .map(([field, v]) => {
          const { from, to } = v as { from?: unknown; to?: unknown };
          return buildChangeRow(row.entityType, field, from, to, labels, isAdmin);
        });
    } else if (row.action === 'CREATE') {
      // A CREATE snapshot is the *entire* created row today (every scalar,
      // including nulls, ids and timestamps) — curated here, on the read
      // side only. The write side must keep writing the full row: an audit
      // trail shouldn't lose data permanently just to make a page tidier.
      const curated = entries.filter(([field, v]) => {
        if (HIDDEN_FIELDS.has(field)) return false;
        if (field === 'displayId') return true;
        return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
      });
      omittedFieldCount = entries.length - curated.length;
      resolvedChanges = curated.map(([field, v]) => buildChangeRow(row.entityType, field, null, v, labels, isAdmin));
    } else {
      // HARD_DELETE's `changes` is the full before-image — the last
      // surviving record of a permanently deleted row. Bookkeeping columns
      // are still hidden, but nothing else is curated away: this is
      // deliberately the one place completeness outranks tidiness.
      resolvedChanges = entries
        .filter(([field]) => !HIDDEN_FIELDS.has(field))
        .map(([field, v]) => buildChangeRow(row.entityType, field, null, v, labels, isAdmin));
    }
  }

  return {
    resolvedChanges,
    omittedFieldCount,
    entityTypeLabel: entityTypeLabel(row.entityType),
    entityLabel: entityResolved?.label ?? synthesizeLabel(resolvedChanges),
    entityDeleted: entityResolved?.deleted ?? false,
    actorName: actorDisplayName(actorResolved?.label),
    affectedRecords: resolveAffectedRecords(row, labels),
  };
}

/**
 * The labels behind whichever id list this entry carries, capped. Unresolvable
 * ids are skipped rather than shown raw — a row that has since been purged
 * shortens the list instead of printing a cuid at a reader.
 */
function resolveAffectedRecords(row: RawAuditLog, labels: LabelMap): string[] | null {
  const metadata = row.metadata;
  if (metadata == null || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const ids = Array.isArray(m.requestedIds) ? m.requestedIds : Array.isArray(m.ids) ? m.ids : null;
  if (!ids || ids.length === 0) return null;
  const resolved = ids
    .slice(0, AFFECTED_LABEL_CAP)
    .map((id) => (typeof id === 'string' ? labels.get(`${row.entityType}:${id}`)?.label : null))
    .filter((label): label is string => typeof label === 'string');
  return resolved.length > 0 ? resolved : null;
}
