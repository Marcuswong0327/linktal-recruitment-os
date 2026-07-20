/**
 * Best-effort keyword classification of a stakeholder's free-text `jobTitle`
 * into one of the seed role-type categories. Not authoritative — it's a
 * starting point (used by the one-time backfill and on create/update when
 * the caller doesn't explicitly set `roleTypeId`); `roleType` stays a real,
 * independently editable field so a bad guess can be corrected without
 * rewriting the person's actual title.
 *
 * Checked in order, first match wins. Functional-area keywords (HR, Talent
 * Acquisition, Finance, Operations) are checked before generic seniority
 * terms (Director, Head of) — "Finance Director" lands in Finance, not
 * Director, since the function is the more useful signal for a recruiter
 * filtering contacts.
 */
const CLASSIFICATION_RULES: { name: string; pattern: RegExp }[] = [
  { name: 'HR', pattern: /\b(hr|human resources|people\s*(&|and)?\s*culture)\b/i },
  {
    name: 'Talent Acquisition',
    pattern: /\b(talent acquisition|recruiter|recruitment|sourcing|ta lead)\b/i,
  },
  { name: 'Finance', pattern: /\b(finance|financial|cfo|accountant|accounting)\b/i },
  { name: 'Operations', pattern: /\b(operations|ops)\b/i },
  { name: 'Hiring Manager', pattern: /\bhiring manager\b/i },
  { name: 'Department Head', pattern: /\b(head of|department head)\b/i },
  { name: 'Director', pattern: /\b(director|chief|vp|vice president)\b/i },
];

export const ROLE_TYPE_CATALOG = [
  'Director',
  'Hiring Manager',
  'HR',
  'Talent Acquisition',
  'Operations',
  'Finance',
  'Department Head',
  'Other',
] as const;

export const OTHER_ROLE_TYPE = 'Other';

export function classifyJobTitle(jobTitle: string | null | undefined): string {
  if (!jobTitle) return OTHER_ROLE_TYPE;
  const match = CLASSIFICATION_RULES.find((rule) => rule.pattern.test(jobTitle));
  return match?.name ?? OTHER_ROLE_TYPE;
}
