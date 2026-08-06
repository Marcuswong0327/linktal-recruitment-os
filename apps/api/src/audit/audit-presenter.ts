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
    if (metadata != null && typeof metadata === 'object' && 'where' in (metadata as Record<string, unknown>)) {
      collectFromWhere(row.entityType, (metadata as Record<string, unknown>).where, add, 0);
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

function formatPlain(field: string, raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'boolean') return booleanLabel(field, raw);
  if (typeof raw === 'string' && ISO_DATE.test(raw)) {
    return new Date(raw).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return String(raw);
}

function resolveValue(model: string, field: string, raw: unknown, labels: LabelMap, redact: boolean): ResolvedValue {
  if (redact) return { raw: null, label: null, kind: 'plain', redacted: true };

  const meta = describeField(model, field);
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

export interface PresentedRow {
  resolvedChanges: ResolvedChange[] | null;
  /** How many raw fields a CREATE snapshot dropped as noise (nulls, ids, timestamps) — lets the UI offer "show all fields" instead of silently hiding data. */
  omittedFieldCount: number;
  entityTypeLabel: string;
  entityLabel: string | null;
  entityDeleted: boolean;
  actorName: string | null;
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
    const entries = Object.entries(changes as Record<string, unknown>);
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
    actorName: actorResolved?.label ?? null,
  };
}
