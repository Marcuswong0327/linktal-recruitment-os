/**
 * Splits a free-text `q` into the terms a list search should match.
 *
 * Callers AND the terms together, each one OR-ed across the searchable
 * columns. That's what lets a query span two columns: a stakeholder stored as
 * `firstName: "Dr"` / `lastName: "Joe"` matches "Dr Joe", where a single
 * `contains "Dr Joe"` against either column alone never can — nothing
 * concatenates the two names, so the whole string is present in no column.
 *
 * A single-word query yields one term, so it behaves exactly as an
 * un-tokenised `contains` did; only multi-word queries change, and only by
 * matching more than they used to.
 */
export function searchTokens(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}
