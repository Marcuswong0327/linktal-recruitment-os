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
  /** An array of ids — every element resolves against `targetType`, same as `fk`. */
  | { kind: 'fk-list'; targetType: string }
  | { kind: 'enum'; enumName: string }
  | { kind: 'plain' };

/**
 * Columns the schema deliberately models as bare strings, not real
 * relations (see the "Logical ref to Consultant.id (no FK)" comments in
 * schema.prisma) — invisible to DMMF by design, so they can't be derived.
 * Verified against every audited model: these two are the only such columns
 * that actually appear on an AUDITED_MODELS entry. (CandidateContactHistory's
 * `contactedById` is a real `@relation`, so it's already resolved via DMMF,
 * not this overlay — it needed adding to AUDITED_MODELS itself, not here.)
 */
const LOGICAL_REFS: Record<string, string> = {
  deletedById: 'Consultant',
  lastContactedById: 'Consultant',
};

/**
 * `${model}.${field}` -> target model, for id *arrays* that exist only in a
 * write payload and therefore not in DMMF at all.
 *
 * A role's permissions are a many-to-many through RolePermission; the service
 * takes them as a flat `permissionIds` array, and that array is what lands in
 * the audit diff. Without this it renders as six raw cuids under the heading
 * "Permission ids" — a field that describes the change precisely and tells the
 * reader nothing. Every entry here is a real DTO field (grep for it), not a
 * guess at one.
 */
const SYNTHETIC_FK_LISTS: Record<string, string> = {
  'Role.permissionIds': 'Permission',
  'Candidate.specializationIds': 'Specialization',
  'JobOrder.consultantIds': 'Consultant',
  'Stakeholder.coverageLocationIds': 'Location',
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
  // Applied last and unconditionally: these fields are absent from DMMF by
  // definition, so there is no model field to check them against.
  for (const [key, targetType] of Object.entries(SYNTHETIC_FK_LISTS)) {
    map.set(key, { kind: 'fk-list', targetType });
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
  /** Scalar columns to select. Joined with " · " unless `format` says otherwise. */
  fields: string[];
  softDeletable: boolean;
  /**
   * Extra nested selects, merged into the query's `select`.
   *
   * A displayId on its own ("SUB-000002") identifies a row without saying
   * anything about it — the reader still has to go and look it up to learn
   * that it was Jane Doe for a Software Engineer role. These pull in just
   * enough of the neighbouring rows to make the label self-explanatory.
   */
  relations?: Record<string, unknown>;
  /** Builds the label from the selected row. Return null to fall back to the `fields` join. */
  format?: (row: Record<string, any>) => string | null;
}

/** Joins the parts that are actually present, so a missing relation just shortens the label instead of leaving a dangling separator. */
function join(...parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  return kept.length > 0 ? kept.join(' · ') : null;
}

/** "Jane Doe" from any row carrying first/last name. */
function personName(row: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null {
  if (!row) return null;
  return join([row.firstName, row.lastName].filter(Boolean).join(' ') || null);
}

export const LABEL_SPEC: Record<string, LabelSpec> = {
  Candidate: { delegate: 'candidate', fields: ['displayId', 'firstName', 'lastName'], softDeletable: true },
  Client: { delegate: 'client', fields: ['displayId', 'companyName'], softDeletable: true },
  Stakeholder: { delegate: 'stakeholder', fields: ['displayId', 'firstName', 'lastName'], softDeletable: true },
  JobOrder: {
    delegate: 'jobOrder',
    fields: ['displayId'],
    softDeletable: true,
    relations: { jobTitle: { select: { name: true } }, client: { select: { companyName: true } } },
    format: (r) => join(r.displayId, r.jobTitle?.name, r.client?.companyName),
  },
  ClientJobResearch: {
    delegate: 'clientJobResearch',
    fields: ['displayId'],
    softDeletable: true,
    relations: { jobTitle: { select: { name: true } }, client: { select: { companyName: true } } },
    format: (r) => join(r.displayId, r.jobTitle?.name, r.client?.companyName),
  },
  CandidateSubmission: {
    delegate: 'candidateSubmission',
    fields: ['displayId'],
    softDeletable: true,
    relations: {
      candidate: { select: { firstName: true, lastName: true } },
      jobOrder: { select: { jobTitle: { select: { name: true } }, client: { select: { companyName: true } } } },
    },
    format: (r) =>
      join(r.displayId, personName(r.candidate), join(r.jobOrder?.jobTitle?.name, r.jobOrder?.client?.companyName)),
  },
  Placement: {
    delegate: 'placement',
    fields: ['displayId'],
    softDeletable: true,
    relations: {
      submission: {
        select: {
          candidate: { select: { firstName: true, lastName: true } },
          jobOrder: { select: { jobTitle: { select: { name: true } }, client: { select: { companyName: true } } } },
        },
      },
    },
    format: (r) =>
      join(
        r.displayId,
        personName(r.submission?.candidate),
        join(r.submission?.jobOrder?.jobTitle?.name, r.submission?.jobOrder?.client?.companyName),
      ),
  },
  // Absent entirely until now, despite being an audited (soft-deletable)
  // model — so every interview row rendered as the anonymous "An interview
  // record" fallback.
  Interview: {
    delegate: 'interview',
    fields: ['displayId', 'roundLabel'],
    softDeletable: true,
    relations: { submission: { select: { candidate: { select: { firstName: true, lastName: true } } } } },
    format: (r) => join(r.displayId, r.roundLabel, personName(r.submission?.candidate)),
  },
  Consultant: { delegate: 'consultant', fields: ['displayId', 'fullName'], softDeletable: false },
  Role: { delegate: 'role', fields: ['name'], softDeletable: false },
  Permission: {
    delegate: 'permission',
    fields: ['resource', 'action'],
    softDeletable: false,
    format: (r) =>
      r.resource ? `${String(r.resource).charAt(0).toUpperCase()}${String(r.resource).slice(1)}: ${r.action}` : null,
  },
  Tob: {
    delegate: 'tob',
    // fileName alone made an uploaded attachment's filename the heading of the
    // whole entry ("GaHSlCFXQAAK0s9.png"), which names the file rather than
    // the agreement it belongs to.
    fields: ['displayId', 'fileName'],
    softDeletable: false,
    relations: { client: { select: { companyName: true } } },
    format: (r) => join(r.displayId, r.client?.companyName, r.fileName),
  },
  // Both appear in the log (campaigns are audited; templates show up on export
  // rows) and neither had a spec, so a campaign entry fell back to a label
  // synthesized from its own fk fields — naming the consultant who created it
  // as though he were the campaign.
  OutreachCampaign: { delegate: 'outreachCampaign', fields: ['displayId', 'name'], softDeletable: false },
  EmailTemplate: { delegate: 'emailTemplate', fields: ['displayId', 'name'], softDeletable: false },
  Industry: { delegate: 'industry', fields: ['name'], softDeletable: false },
  Specialization: { delegate: 'specialization', fields: ['name'], softDeletable: false },
  Location: { delegate: 'location', fields: ['name'], softDeletable: false },
  JobTitle: { delegate: 'jobTitle', fields: ['name'], softDeletable: false },
  JobRoleType: { delegate: 'jobRoleType', fields: ['name'], softDeletable: false },
  StakeholderRoleType: { delegate: 'stakeholderRoleType', fields: ['name'], softDeletable: false },
  CandidateContactHistory: {
    delegate: 'candidateContactHistory',
    fields: ['displayId', 'category'],
    softDeletable: false,
    relations: { candidate: { select: { firstName: true, lastName: true } } },
    format: (r) => join(r.displayId, personName(r.candidate), r.category ? enumLabel('ContactCategory', r.category) : null),
  },
  StakeholderContactHistory: {
    delegate: 'stakeholderContactHistory',
    fields: ['displayId'],
    softDeletable: false,
    relations: { stakeholder: { select: { firstName: true, lastName: true } } },
    format: (r) => join(r.displayId, personName(r.stakeholder)),
  },
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
// lastContactedById -> "Last contacted by") comes out right generically, now
// that the fallback strips a trailing "Id" — these remain only because the
// generic transform gives them the wrong *words*, not the wrong suffix.
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
  // A list, and not of ids by the time anyone reads it.
  permissionIds: 'Permissions',
  specializationIds: 'Specializations',
  consultantIds: 'Consultants',
  coverageLocationIds: 'Coverage',
  isActive: 'Status',
  // The generic path below strips a trailing "Id", which would leave this one
  // as the bare word "Display".
  displayId: 'Reference',
};

/** "jobRoleTypeId" -> "Job role type". Same fallback shape as the existing frontend `friendlyField`, now the single source of truth (backend, reused by the FE instead of re-guessed there). */
export function fieldLabel(field: string): string {
  if (FIELD_LABEL_OVERRIDES[field]) return FIELD_LABEL_OVERRIDES[field];
  // Strip a trailing "Id" for every fk the override map doesn't name — the
  // value shown beside it is a resolved label, not an id, so "Contacted by id:
  // Sarah Chen" labelled it as the one thing it isn't.
  const base = field.replace(/Id$/, '');
  const spaced = base.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
