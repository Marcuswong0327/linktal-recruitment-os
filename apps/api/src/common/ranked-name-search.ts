import { Prisma } from '@prisma/client';

/**
 * Orders a name-catalog search by *where the match falls*, not just
 * alphabetically.
 *
 * The catalogs match with `contains`, so typing "Tools" hits
 * "Engineering Parts Hardware tools" as readily as "Tools Manufacturing" —
 * and a plain `orderBy: { name: 'asc' }` then buries the one that actually
 * starts with what was typed under every match beginning with an earlier
 * letter. Sorting by a column unrelated to the query is the bug.
 *
 * Done as two passes rather than one query re-sorted afterwards, because the
 * result is capped: a single `contains` query with `take: 20` can spend all
 * twenty rows on mid-word matches and drop the prefix match entirely before
 * any re-sort gets to see it. Prefix matches are fetched first and the
 * remainder only backfills what's left of the cap.
 *
 * Prisma can't express this as one query — `orderBy` takes columns, not
 * expressions like `position(lower($q) in lower(name))` — and two indexed
 * lookups on a small catalog are cheaper than dropping to raw SQL and
 * rebuilding each caller's filters by hand.
 *
 * `fetch` is supplied by the caller so every service keeps its own `where`
 * and its own tie-break ordering (Locations sort by level before name, for
 * instance); this only decides which name filter runs and how much of the
 * cap is left.
 */
export interface NameMatch {
  name?: Prisma.StringFilter;
  NOT?: { name: Prisma.StringFilter };
}

export async function rankedNameSearch<TRow>(
  q: string | undefined,
  take: number | undefined,
  fetch: (match: NameMatch, take: number | undefined) => Promise<TRow[]>,
): Promise<TRow[]> {
  if (!q) return fetch({}, take);

  const mode = Prisma.QueryMode.insensitive;
  const startsWith = { startsWith: q, mode };

  const prefixed = await fetch({ name: startsWith }, take);
  if (take !== undefined && prefixed.length >= take) return prefixed;

  // The exclusion is a where-level `NOT`, not `name.not`: Prisma rejects
  // `mode` inside a nested `not` filter, which would silently make the
  // second pass case-sensitive if it were accepted at all.
  const rest = await fetch(
    { name: { contains: q, mode }, NOT: { name: startsWith } },
    take === undefined ? undefined : take - prefixed.length,
  );
  return [...prefixed, ...rest];
}
