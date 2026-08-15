import { Prisma } from '@prisma/client';

/**
 * Pure schema metadata for turning a raw `AuditLog.changes` diff into
 * something a human can read — which fields are foreign keys (and to what),
 * which are enums, which carry sensitive data, and how to word a field name.
 * No IO, no Prisma client, no DI — everything here is either derived once
 * from `Prisma.dmmf` at module load or a small hand-written override table.
 */

export type AuditFieldMeta =
  | { kind: 'fk'; targetType: string }
  | { kind: 'enum'; enumName: string }
  | { kind: 'plain' };

/**
 * Columns the schema deliberately models as bare strings, not real
 * relations (see the "Logical ref to Consultant.id (no FK)" comments in
 * schema.prisma) — invisible to DMMF by design, so they can't be derived.
 * Verified against every audited model: these two are the only such columns
 * that actually appear on an AUDITED_MODELS entry (CandidateContactHistory's
 * `contactedById` is a real `@relation`, but that model isn't audited at
 * all, so it never reaches this map).
 */
const LOGICAL_REFS: Record<string, string> = {
  deletedById: 'Consultant',
  lastContactedById: 'Consultant',
};

/**
 * `${model}.${field}` -> metadata, built once from Prisma's own schema
 * metadata rather than hand-maintained — a hand-written field->model map
 * is exactly the kind of thing that silently drifts as the schema changes
 * (see the "jobTitle is a relation now, not a scalar" comment already
 * scarred into AuditService's ENTITY_LABEL). DMMF can't drift: it *is* the
 * schema. LOGICAL_REFS above is a small, deliberately hand-maintained
 * overlay for the handful of columns DMMF can't see at all.
 */
const FIELD_META: ReadonlyMap<string, AuditFieldMeta> = buildFieldMeta();

function buildFieldMeta(): Map<string, AuditFieldMeta> {
  const map = new Map<string, AuditFieldMeta>();
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      if (field.kind === 'object' && field.relationFromFields?.length === 1) {
        map.set(`${model.name}.${field.relationFromFields[0]}`, { kind: 'fk', targetType: field.type });
      } else if (field.kind === 'enum') {
        map.set(`${model.name}.${field.name}`, { kind: 'enum', enumName: field.type });
      }
    }
    for (const [field, targetType] of Object.entries(LOGICAL_REFS)) {
      const key = `${model.name}.${field}`;
      if (!map.has(key) && model.fields.some((f) => f.name === field)) {
        map.set(key, { kind: 'fk', targetType });
      }
    }
  }
  return map;
}

export function describeField(model: string, field: string): AuditFieldMeta {
  return FIELD_META.get(`${model}.${field}`) ?? { kind: 'plain' };
}

/**
 * How to fetch + build a label for a given target model — a superset of
 * AuditService's original ENTITY_LABEL (the row's own entityType is always
 * one of AUDITED_MODELS; an FK inside a diff can point at a catalog that
 * never gets audited itself, e.g. Industry). `softDeletable` controls
 * whether a resolved target additionally gets flagged `deleted: true`
 * (looked up via the base client, which bypasses the soft-delete filter —
 * see LabelResolverService's doc for why that matters).
 */
export interface LabelSpec {
  delegate: string;
  fields: string[];
  softDeletable: boolean;
}

export const LABEL_SPEC: Record<string, LabelSpec> = {
  Candidate: { delegate: 'candidate', fields: ['displayId', 'firstName', 'lastName'], softDeletable: true },
  Client: { delegate: 'client', fields: ['displayId', 'companyName'], softDeletable: true },
  Stakeholder: { delegate: 'stakeholder', fields: ['displayId', 'firstName', 'lastName'], softDeletable: true },
  JobOrder: { delegate: 'jobOrder', fields: ['displayId'], softDeletable: true },
  ClientJobResearch: { delegate: 'clientJobResearch', fields: ['displayId'], softDeletable: true },
  CandidateSubmission: { delegate: 'candidateSubmission', fields: ['displayId'], softDeletable: true },
  Placement: { delegate: 'placement', fields: ['displayId'], softDeletable: true },
  Consultant: { delegate: 'consultant', fields: ['displayId', 'fullName'], softDeletable: false },
  Role: { delegate: 'role', fields: ['name'], softDeletable: false },
  Permission: { delegate: 'permission', fields: ['resource', 'action'], softDeletable: false },
  Tob: { delegate: 'tob', fields: ['fileName'], softDeletable: false },
  Industry: { delegate: 'industry', fields: ['name'], softDeletable: false },
  Specialization: { delegate: 'specialization', fields: ['name'], softDeletable: false },
  Location: { delegate: 'location', fields: ['name'], softDeletable: false },
  JobTitle: { delegate: 'jobTitle', fields: ['name'], softDeletable: false },
  JobRoleType: { delegate: 'jobRoleType', fields: ['name'], softDeletable: false },
  StakeholderRoleType: { delegate: 'stakeholderRoleType', fields: ['name'], softDeletable: false },
};

/**
 * What to call each audited Prisma model to an admin who doesn't know the
 * schema. Most already match the app's own nav/page vocabulary (Stakeholder,
 * Job Order, Consultant, Role — see config/nav.ts) so those are left as a
 * generic camelCase->spaced fallback; the ones that need a real override are
 * either internal join/grant tables with no page of their own
 * (ConsultantIndustry) or abbreviations from the source workbook (Tob).
 */
const ENTITY_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  JobOrder: 'Job Order',
  CandidateSubmission: 'Submission',
  ClientJobResearch: 'Job Research',
  ConsultantIndustry: 'Industry Assignment',
  JobOrderConsultant: 'Consultant Assignment',
  Tob: 'Terms of Business',
};

export function entityTypeLabel(entityType: string): string {
  if (ENTITY_TYPE_LABEL_OVERRIDES[entityType]) return ENTITY_TYPE_LABEL_OVERRIDES[entityType];
  return entityType.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Values that read wrong under a generic Title Case transform — checked
 * against every value of every enum in the schema (11 enums, 45 values).
 * `UNS` ("unsuitable", per the schema comment) is the only abbreviation in
 * the entire enum surface; everything else Title-Cases cleanly
 * (ON_HOLD -> "On Hold", PERCENTAGE -> "Percentage", ...). An enum value
 * added later that isn't listed here just falls through to the generic
 * transform — this map can never be the reason a page breaks.
 */
const ENUM_LABEL_OVERRIDES: Record<string, string> = {
  'CandidateStatus.UNS': 'Unsuitable',
};

export function enumLabel(enumName: string, value: string): string {
  const override = ENUM_LABEL_OVERRIDES[`${enumName}.${value}`];
  if (override) return override;
  return value
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Boolean fields across every audited model, checked by hand: `isAccurate`,
 * `isContacted`, `accountsNotified` all read fine as generic Yes/No, because
 * their field labels are phrased as a question ("Is accurate: Yes"). Only
 * `isActive` breaks that pattern — its label is "Status" (see
 * FIELD_LABEL_OVERRIDES below), a noun, so "Status: Yes" reads as
 * nonsensical where "Status: Active" doesn't.
 */
const BOOLEAN_VALUE_OVERRIDES: Record<string, [trueLabel: string, falseLabel: string]> = {
  isActive: ['Active', 'Inactive'],
};

export function booleanLabel(field: string, value: boolean): string {
  const override = BOOLEAN_VALUE_OVERRIDES[field];
  if (override) return value ? override[0] : override[1];
  return value ? 'Yes' : 'No';
}

/**
 * Role-sensitive columns to redact in the activity log regardless of the
 * viewer — `audit:read` is admin-only today (see docs/rbac-roles.md), but
 * these are compensation fields that shouldn't leak if `audit:read` is ever
 * granted more broadly.
 */
export const SENSITIVE_FIELDS: Record<string, Set<string>> = {
  Consultant: new Set(['salary', 'costTo']),
};

// A handful of field names read badly under the generic transform below —
// "Consultant id" instead of "Consultant", "Job research id" instead of a
// real phrase. Everything else (reportsToId -> "Reports to",
// lastContactedById -> "Last contacted by") comes out right generically.
const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  consultantId: 'Consultant',
  clientId: 'Client',
  candidateId: 'Candidate',
  jobOrderId: 'Job order',
  submissionId: 'Submission',
  industryId: 'Industry',
  specializationId: 'Specialization',
  locationId: 'Location',
  jobTitleId: 'Job title',
  jobRoleTypeId: 'Job role type',
  stakeholderRoleTypeId: 'Stakeholder role type',
  roleId: 'Role',
  linktalRepresentativeId: "Linktal representative",
  jobResearchId: 'Source research',
  isActive: 'Status',
};

/** "jobRoleTypeId" -> "Job role type". Same fallback shape as the existing frontend `friendlyField`, now the single source of truth (backend, reused by the FE instead of re-guessed there). */
export function fieldLabel(field: string): string {
  if (FIELD_LABEL_OVERRIDES[field]) return FIELD_LABEL_OVERRIDES[field];
  const spaced = field.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
