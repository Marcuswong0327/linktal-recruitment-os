/**
 * Splits one typed name into the `firstName` / `lastName` pair the API stores.
 *
 * The split is on the **last** whitespace run, so everything before it is the
 * first name: "Yung Jack Chan" → `{ firstName: 'Yung Jack', lastName: 'Chan' }`.
 * That's the right way round for the names in this data — multi-part given
 * names are common, multi-part surnames much less so — and a single word is
 * kept whole as the first name ("Ng" → `{ firstName: 'Ng' }`), since
 * `firstName` is the required half.
 *
 * It is a convenience over the stored shape, not a replacement for it: a name
 * the rule gets wrong is corrected field-by-field on the record's own detail
 * page, where the two are edited separately.
 */
export function splitFullName(input: string): { firstName: string; lastName?: string } {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '' };
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}
