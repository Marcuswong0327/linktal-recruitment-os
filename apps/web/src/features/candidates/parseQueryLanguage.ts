import type { GetCandidatesStatusesItem } from '@/lib/api/generated/types';
import type { CandidateFilterState } from './useCandidateSearch';
import { candidateStatusLabels, candidateStatuses } from './schema';

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
