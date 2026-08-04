/**
 * Maps Linktal's desk labels onto real GeoNames nodes.
 *
 * The workbook talks in desk names — "Brisbane GC QLD", "Klang Valley", "East
 * Malaysia". None of those is a place: they're *groupings* of places, which is
 * why they can't be rows in the Location tree (that tree is GeoNames-loaded and
 * admin-only to write). Each alias therefore resolves to one or more real
 * nodes, and because a grant covers a node plus every descendant, granting
 * `STATE:Sabah` + `STATE:Sarawak` genuinely means "East Malaysia".
 *
 * Anything not listed here is a reject, never a new node.
 */

export type AliasTarget = { level: 'COUNTRY' | 'STATE' | 'CITY'; name: string };

/** Peninsular Malaysia, for the "West Malaysia" desk. */
const WEST_MALAYSIA_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Kuala Lumpur',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Putrajaya',
  'Selangor',
  'Terengganu',
];

const state = (name: string): AliasTarget => ({ level: 'STATE', name });
const city = (name: string): AliasTarget => ({ level: 'CITY', name });
const country = (name: string): AliasTarget => ({ level: 'COUNTRY', name });

/**
 * Keys are normalised (lowercased, punctuation stripped) by `aliasKey` below,
 * so "Sydney NSW", "Sydney (NSW)" and "Sydney NSW," all land on one entry.
 */
export const LOCATION_ALIASES: Record<string, AliasTarget[]> = {
  // --- countries -----------------------------------------------------------
  australia: [country('Australia')],
  malaysia: [country('Malaysia')],
  'all malaysia': [country('Malaysia')],
  'all australia': [country('Australia')],

  // --- Australian desks ----------------------------------------------------
  'sydney nsw': [city('Sydney')],
  'melbourne vic': [city('Melbourne')],
  // One desk covering two metros.
  'brisbane gc qld': [city('Brisbane'), city('Gold Coast')],
  'brisbane qld': [city('Brisbane')],

  // --- Malaysian desks -----------------------------------------------------
  // The Klang Valley conurbation spans three federal/state territories.
  'klang valley': [state('Kuala Lumpur'), state('Selangor'), state('Putrajaya')],
  // Borneo.
  'east malaysia': [state('Sabah'), state('Sarawak'), state('Labuan')],
  'west malaysia': WEST_MALAYSIA_STATES.map(state),
};

/**
 * Known misspellings in the source data, folded in before lookup. Kept separate
 * from the alias table so it's obvious which entries are real vocabulary and
 * which are typo repairs — and so a fix in the sheet just makes a line here dead
 * rather than changing behaviour.
 */
const TYPO_FIXES: Record<string, string> = {
  'melboune vic': 'melbourne vic',
  'melbourne vic ': 'melbourne vic',
};

/**
 * Normalises a raw cell into an alias key: lowercase, parentheses and trailing
 * punctuation removed, whitespace collapsed. "Sydney (NSW)" -> "sydney nsw".
 */
export function aliasKey(raw: string): string {
  const key = raw
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[.,;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return TYPO_FIXES[key] ?? key;
}

/** Resolves a raw cell to alias targets, or null when it isn't a known desk. */
export function resolveAlias(raw: string): AliasTarget[] | null {
  return LOCATION_ALIASES[aliasKey(raw)] ?? null;
}
