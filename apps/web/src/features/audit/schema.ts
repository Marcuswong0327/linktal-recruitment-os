import type { AuditLogEntity } from '@/lib/api/generated/types';
import { GetAuditLogsAction } from '@/lib/api/generated/types';

export type AuditLog = AuditLogEntity;

export const auditActions = Object.values(GetAuditLogsAction);

export const auditActionLabels: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  SOFT_DELETE: 'Deleted',
  RESTORE: 'Restored',
  DEACTIVATE: 'Deactivated',
  HARD_DELETE: 'Purged',
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

// The entity types the audit extension records (see AUDITED_MODELS).
export const auditEntityTypes = [
  'Candidate',
  'Client',
  'Stakeholder',
  'JobOrder',
  'CandidateSubmission',
  'Placement',
  'ClientJobResearch',
  'Consultant',
] as const;

// Bookkeeping fields that only add noise — the Action badge already conveys
// delete/restore, and timestamps aren't meaningful "changes" to a reader.
const HIDDEN_CHANGE_FIELDS = new Set(['deletedAt', 'deletedById', 'updatedAt', 'createdAt']);

/**
 * Renders `changes` as a short human summary. Handles both the diff shape
 * ({ field: { from, to } }) and a created snapshot (a plain object). Internal
 * bookkeeping fields are hidden, so e.g. a soft-delete shows "—" (the Action
 * column already says "Deleted") instead of "deletedAt: ∅ → 2026-…".
 */
export function summarizeChanges(changes: unknown): string {
  if (changes == null || typeof changes !== 'object') return '—';
  const entries = Object.entries(changes as Record<string, unknown>).filter(
    ([key]) => !HIDDEN_CHANGE_FIELDS.has(key),
  );
  if (entries.length === 0) return '—';

  const isDiff = entries.every(
    ([, v]) => v != null && typeof v === 'object' && ('from' in v || 'to' in v),
  );

  if (isDiff) {
    return entries
      .map(([field, v]) => {
        const { from, to } = v as { from?: unknown; to?: unknown };
        return `${field}: ${fmt(from)} → ${fmt(to)}`;
      })
      .join(', ');
  }
  // Created snapshot — list which fields were set (capped so it stays readable).
  const names = entries.map(([k]) => k);
  const shown = names.slice(0, 4).join(', ');
  return `set ${shown}${names.length > 4 ? `, +${names.length - 4} more` : ''}`;
}

function fmt(v: unknown): string {
  if (v == null) return '∅';
  const s = String(v);
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

// ---------------------------------------------------------------------------
// Friendly (non-technical) formatting for the detail sheet.
// ---------------------------------------------------------------------------

// A plain-English sentence for actions where the field diff is just bookkeeping.
const ACTION_SENTENCE: Record<string, string> = {
  SOFT_DELETE: 'Archived (soft-deleted) — this can be restored.',
  RESTORE: 'Restored from the archive.',
  HARD_DELETE: 'Permanently deleted — this cannot be undone.',
  DEACTIVATE: 'Account deactivated — the user can no longer sign in.',
  CREATE: 'Created.',
};

export function describeAction(action: string): string | null {
  return ACTION_SENTENCE[action] ?? null;
}

const FIELD_LABELS: Record<string, string> = {
  isActive: 'Status',
  roleId: 'Role',
  roleName: 'Role',
  fullName: 'Full name',
  companyName: 'Company',
  jobTitle: 'Job title',
  salaryExpectation: 'Salary expectation',
  currentCompany: 'Current company',
  currentPosition: 'Current position',
};

export function friendlyField(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  // camelCase → "Camel case"
  const spaced = field.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

export function friendlyValue(field: string, value: unknown): string {
  if (value == null || value === '') return 'empty';
  if (field === 'isActive') return value === true ? 'Active' : 'Inactive';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && ISO_DATE.test(value)) {
    return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return String(value);
}

export interface ChangeRow {
  field: string;
  from: string | null; // null for a created snapshot (no "before")
  to: string;
}

/** Field-level rows for the detail sheet, with bookkeeping fields hidden. */
export function changeRows(changes: unknown): ChangeRow[] {
  if (changes == null || typeof changes !== 'object') return [];
  const entries = Object.entries(changes as Record<string, unknown>).filter(
    ([key]) => !HIDDEN_CHANGE_FIELDS.has(key),
  );
  return entries.map(([field, v]) => {
    if (v != null && typeof v === 'object' && ('from' in v || 'to' in v)) {
      const { from, to } = v as { from?: unknown; to?: unknown };
      return { field: friendlyField(field), from: friendlyValue(field, from), to: friendlyValue(field, to) };
    }
    // Created snapshot: only a "to" value.
    return { field: friendlyField(field), from: null, to: friendlyValue(field, v) };
  });
}

const SOURCE_LABELS: Record<string, string> = {
  'azure-jit': 'Auto-created on first Microsoft sign-in',
  'password-registration': 'Self-registered with email + password',
  'azure-link': 'Linked to a Microsoft account',
  'password-link': 'Enabled email + password sign-in',
};

/** Human-readable metadata rows (requestId is kept out — it's a support ref). */
export function metadataRows(metadata: unknown): { label: string; value: string }[] {
  if (metadata == null || typeof metadata !== 'object') return [];
  const m = metadata as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  if (typeof m.source === 'string') {
    rows.push({ label: 'How', value: SOURCE_LABELS[m.source] ?? m.source });
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
