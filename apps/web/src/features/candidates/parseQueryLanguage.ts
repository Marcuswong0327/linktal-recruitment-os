import type { GetCandidatesStatusesItem } from '@/lib/api/generated/types';
import type { CandidateFilterState } from './useCandidateSearch';
import { candidateStatusLabels, candidateStatuses, candidateStatusVariants } from './schema';

/** Subset of Badge's variant prop this module cares about — kept local so parsing logic doesn't import a UI component just for its prop type. */
type SuggestionBadgeVariant = 'info' | 'warning' | 'destructive' | 'success' | 'muted';

interface NamedOption {
  id: string;
  name: string;
}

export interface QueryLanguageLookups {
  industries: NamedOption[];
  roleTypes: NamedOption[];
  specializations: NamedOption[];
  consultants: NamedOption[];
}

/** Inline help shown under the Advanced search input — keep in sync with the KEY_ALIASES below. */
export const QUERY_LANGUAGE_HELP =
  'Column: Value, separated by commas or "AND". Supported columns: Status, Location, Industry, Role Type, Specialization, Skill, Consultant. Anything else searches free text (name, title, company, email, phone).';

type ResolvableKey = 'industryIds' | 'roleTypeIds' | 'specializationIds' | 'consultantIds';

const KEY_ALIASES: Record<string, { field: 'status' } | { field: 'location' } | { field: 'skill' } | { field: ResolvableKey }> = {
  status: { field: 'status' },
  location: { field: 'location' },
  city: { field: 'location' },
  country: { field: 'location' },
  industry: { field: 'industryIds' },
  'role type': { field: 'roleTypeIds' },
  roletype: { field: 'roleTypeIds' },
  specialization: { field: 'specializationIds' },
  specialisation: { field: 'specializationIds' },
  skill: { field: 'skill' },
  skills: { field: 'skill' },
  consultant: { field: 'consultantIds' },
};

function findByName(options: NamedOption[], value: string): NamedOption | undefined {
  const needle = value.trim().toLowerCase();
  return options.find((o) => o.name.toLowerCase() === needle);
}

function findStatus(value: string): GetCandidatesStatusesItem | undefined {
  const needle = value.trim().toLowerCase();
  return candidateStatuses.find(
    (status) => status.toLowerCase() === needle || candidateStatusLabels[status].toLowerCase() === needle,
  ) as GetCandidatesStatusesItem | undefined;
}

/**
 * Parses `Key: Value` clauses (separated by commas or "AND") into a filter
 * patch. Recognized keys resolve to real filter fields — Industry/Role
 * Type/Specialization/Consultant resolve a typed name against the already-
 * loaded option lists (case-insensitive exact match); Status matches against
 * the real enum labels (Cold/Warm/Hot/Placed), not example text from a spec
 * doc. Anything unrecognized — an unknown key, or a value that doesn't match
 * a real option — degrades gracefully into the free-text `q` fragment
 * instead of being silently dropped, so a typo still finds something.
 */
export function parseQueryLanguage(
  input: string,
  lookups: QueryLanguageLookups,
): { patch: Partial<CandidateFilterState>; unmatched: string[] } {
  const clauses = input
    .split(/,|\bAND\b/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const patch: Partial<CandidateFilterState> & {
    statuses?: GetCandidatesStatusesItem[];
    industryIds?: string[];
    roleTypeIds?: string[];
    specializationIds?: string[];
    consultantIds?: string[];
    skills?: string[];
  } = {};
  const unmatched: string[] = [];

  const pushArray = <K extends ResolvableKey | 'statuses' | 'skills'>(key: K, value: string) => {
    const arr = ((patch as Record<string, string[] | undefined>)[key] ??= []);
    arr.push(value);
  };

  for (const clause of clauses) {
    const colonIndex = clause.indexOf(':');
    if (colonIndex === -1) {
      unmatched.push(clause);
      continue;
    }
    const rawKey = clause.slice(0, colonIndex).trim().toLowerCase();
    const value = clause.slice(colonIndex + 1).trim();
    const alias = KEY_ALIASES[rawKey];
    if (!value || !alias) {
      unmatched.push(clause);
      continue;
    }

    if (alias.field === 'status') {
      const status = findStatus(value);
      if (status) pushArray('statuses', status);
      else unmatched.push(clause);
      continue;
    }
    if (alias.field === 'location') {
      patch.location = value;
      continue;
    }
    if (alias.field === 'skill') {
      pushArray('skills', value);
      continue;
    }

    // Resolvable id-backed fields (industry/role type/specialization/consultant).
    const options =
      alias.field === 'industryIds'
        ? lookups.industries
        : alias.field === 'roleTypeIds'
          ? lookups.roleTypes
          : alias.field === 'specializationIds'
            ? lookups.specializations
            : lookups.consultants;
    const match = findByName(options, value);
    if (match) pushArray(alias.field, match.id);
    else unmatched.push(clause);
  }

  return { patch, unmatched };
}

export interface QueryLanguageField {
  /** Lowercased key text this field resolves through in KEY_ALIASES — also what typing it verbatim (case-insensitively) matches. */
  key: string;
  /** Canonical display form — what Tab-completing the field inserts. */
  label: string;
}

/**
 * The columns offered by the field-name autocomplete. A few extra spellings
 * (roletype/specialisation/city/country) still parse via KEY_ALIASES, but
 * only one canonical form per concept is worth suggesting.
 */
export const QUERY_LANGUAGE_FIELDS: QueryLanguageField[] = [
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'industry', label: 'Industry' },
  { key: 'role type', label: 'Role Type' },
  { key: 'specialization', label: 'Specialization' },
  { key: 'skill', label: 'Skill' },
  { key: 'consultant', label: 'Consultant' },
];

export interface QueryLanguageValueOption {
  label: string;
  variant?: SuggestionBadgeVariant;
}

/**
 * Suggested values for a field key already typed before the colon (matched
 * the same way KEY_ALIASES resolves it during parsing — case-insensitive,
 * any recognized alias). Returns null for free-text fields (Location/Skill)
 * or an unrecognized key — nothing to browse, so the caller should show no
 * dropdown and let the user keep typing.
 */
export function getValueSuggestions(
  fieldKeyRaw: string,
  lookups: QueryLanguageLookups,
): QueryLanguageValueOption[] | null {
  const alias = KEY_ALIASES[fieldKeyRaw.trim().toLowerCase()];
  if (!alias) return null;
  switch (alias.field) {
    case 'status':
      return candidateStatuses.map((s) => ({
        label: candidateStatusLabels[s],
        variant: candidateStatusVariants[s],
      }));
    case 'industryIds':
      return lookups.industries.map((i) => ({ label: i.name }));
    case 'roleTypeIds':
      return lookups.roleTypes.map((r) => ({ label: r.name }));
    case 'specializationIds':
      return lookups.specializations.map((s) => ({ label: s.name }));
    case 'consultantIds':
      return lookups.consultants.map((c) => ({ label: c.name }));
    case 'location':
    case 'skill':
      return null;
  }
}

export interface ResolvedClause {
  /** Everything up to and including the colon, e.g. "Status:" — rendered plain, just marks a real key was recognized. */
  keyText: string;
  /** Everything after the colon, including any leading space — rendered in `valueColor` when the typed value actually resolves to a real option. */
  valueText: string;
  /** Status gets its real temperature color; a matched catalog name (industry/role type/specialization/consultant) gets a neutral "recognized" color since those fields have no per-value color scheme of their own; free text and unmatched values get none. */
  valueColor?: SuggestionBadgeVariant | 'recognized';
}

/**
 * Resolves one already-typed `Key: Value` clause for inline syntax
 * highlighting in the search box — reuses the exact same alias/matching
 * rules `parseQueryLanguage` applies at submit time, so whatever gets
 * colored is guaranteed to be exactly what would actually be applied as a
 * filter. Returns null when there's no recognized key yet (a bare key still
 * being typed, or free text) — nothing to highlight.
 */
export function resolveClauseForHighlight(
  clauseText: string,
  lookups: QueryLanguageLookups,
): ResolvedClause | null {
  const colonIndex = clauseText.indexOf(':');
  if (colonIndex === -1) return null;
  const rawKey = clauseText.slice(0, colonIndex).trim().toLowerCase();
  const alias = KEY_ALIASES[rawKey];
  if (!alias) return null;

  const keyText = clauseText.slice(0, colonIndex + 1);
  const valueText = clauseText.slice(colonIndex + 1);
  const trimmedValue = valueText.trim();
  if (!trimmedValue) return { keyText, valueText };

  if (alias.field === 'status') {
    const status = findStatus(trimmedValue);
    return { keyText, valueText, valueColor: status ? candidateStatusVariants[status] : undefined };
  }
  if (alias.field === 'location' || alias.field === 'skill') {
    return { keyText, valueText }; // free text — never colored
  }
  const options =
    alias.field === 'industryIds'
      ? lookups.industries
      : alias.field === 'roleTypeIds'
        ? lookups.roleTypes
        : alias.field === 'specializationIds'
          ? lookups.specializations
          : lookups.consultants;
  const match = findByName(options, trimmedValue);
  return { keyText, valueText, valueColor: match ? 'recognized' : undefined };
}

/**
 * Canonical field keys already used as a `Key:` clause somewhere in the
 * text — lets the field-name autocomplete hide columns already in the
 * query instead of offering the same one twice. Matches through the same
 * KEY_ALIASES resolution as parsing itself, so a clause spelled with an
 * alias (e.g. "roletype:") still counts as that field being used. This
 * only affects what's *suggested* — retyping a field manually still works,
 * and parseQueryLanguage still happily accumulates multiple values for
 * fields that support it (Status, Skill).
 */
export function getUsedFieldKeys(text: string): Set<string> {
  const used = new Set<string>();
  for (const clause of text.split(/,|\bAND\b/i)) {
    const colonIndex = clause.indexOf(':');
    if (colonIndex === -1) continue;
    const alias = KEY_ALIASES[clause.slice(0, colonIndex).trim().toLowerCase()];
    if (!alias) continue;
    const field = QUERY_LANGUAGE_FIELDS.find((f) => KEY_ALIASES[f.key]?.field === alias.field);
    if (field) used.add(field.key);
  }
  return used;
}
