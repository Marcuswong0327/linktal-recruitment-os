/**
 * The coarse tier of the Specialization tree, per Industry.
 *
 * The source data already encodes two levels in its naming — "Engineering Parts
 * Fibre Optics" under "Engineering Parts", "Food Bakery" under "Food" — it just
 * isn't structured that way. These are the parent categories; the importer
 * assigns each raw value to the **longest** matching category by prefix, and
 * anything unmatched becomes a top-level specialization directly under its
 * industry (never a reject — a specialization with no parent is fine).
 *
 * This list matters because it's the vocabulary consultants scope in: Karen Lin
 * holds "Food", Eve Goh holds "Packaging" and "Engineering Parts". A grant on a
 * category covers every child, which is what reconciles coarse grants against
 * fine record-level tags.
 *
 * Coverage against the current workbook: 93.9% of client specialization values
 * fall under one of these.
 */
export const SPECIALIZATION_CATEGORIES: Record<string, string[]> = {
  Manufacturing: [
    'Engineering Parts',
    'Engineering Services',
    'Building Materials',
    'Industrial Machinery',
    'Packaging',
    'Pharmaceutical',
    'Pharma-Bio',
    'Consumer Goods',
    'Plastic',
    'Food',
    'Beverage',
    'Chemical',
    'Steel',
    'Recycling',
    'Mining',
    'Distributor/Supplier/Wholesale',
    'Services',
  ],
  Construction: [
    'Class 1',
    'Class 2',
    'Fitout',
    'Remedial',
    'Civil',
    'Commercial',
    'Residential',
    'Home',
    'Facade',
    'Shopfitting',
    'Concrete',
    'Builder',
    'Insurance',
  ],
  'Banking Financial Services': [
    'Bank',
    'Asset Management',
    'Insurance',
    'Broking Trading',
    'Wealth',
    'Digital Banks',
  ],
  Equipment: ['EWP', 'Crane', 'Forklift', 'Excavators'],
};

/**
 * Industry names are spelled inconsistently across tabs — the Client sheet says
 * "Banking; Financial Services", the Candidate sheet "Banking Financial
 * Services". Folded to one canonical name before anything is created, so the
 * scope arm doesn't end up with two industries that mean the same thing.
 */
export const INDUSTRY_ALIASES: Record<string, string> = {
  manufacturing: 'Manufacturing',
  construction: 'Construction',
  'banking financial services': 'Banking Financial Services',
  'banking; financial services': 'Banking Financial Services',
  banking: 'Banking Financial Services',
  equipment: 'Equipment',
};

export function canonicalIndustry(raw: string): string | null {
  const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  return INDUSTRY_ALIASES[key] ?? null;
}

/**
 * Longest-prefix match of a raw specialization value against its industry's
 * categories. Returns null when nothing matches — the caller then creates the
 * value as a top-level specialization rather than forcing it under a parent.
 */
/**
 * Folds spelling variance that would otherwise defeat prefix matching. The
 * consultant sheet writes "Class2" while the client sheet writes "Class 2";
 * without this, Joshua Fang's grant silently drops a whole category.
 */
function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(class)\s*(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function categoryFor(industry: string, raw: string): string | null {
  const candidates = SPECIALIZATION_CATEGORIES[industry] ?? [];
  const value = normalizeForMatch(raw);
  let best: string | null = null;
  for (const category of candidates) {
    const key = normalizeForMatch(category);
    const matches = value === key || value.startsWith(`${key} `) || value.startsWith(`${key}-`);
    if (matches && (best === null || category.length > best.length)) best = category;
  }
  return best;
}

/**
 * The Candidate sheet's "Specialization (FT)" column carries two different
 * kinds of value depending on industry, so it can't be read uniformly:
 *
 *  - **Manufacturing** (180 rows) — a real tag: "Food", "Steel", "Bakery".
 *  - **Construction** (915 rows, 890 of them comma-triples) — a free-text
 *    summary of role + sector + state: "Project Manager, residential, NSW",
 *    "CA, class 2, NSW". Only the **middle** token is a specialization; the
 *    first is the person's role and the third their state, both of which the
 *    sheet already carries in better-populated columns of their own.
 *
 * This extracts the specialization part and leaves the rest alone.
 */
export function candidateSpecializationValue(raw: string): string {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[1] : raw;
}
