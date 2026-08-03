/**
 * Recomputes `ancestorIds` on the two scope trees (Location, Specialization).
 *
 *   pnpm --filter @linktal/api backfill:ancestors
 *
 * `ancestorIds` holds the node itself plus every ancestor, root-last — so
 * Silverwater is [silverwater, sydney, nsw, australia]. That's what turns
 * "is this record inside a granted node" into a single indexed `hasSome`
 * against the consultant's grant list, instead of a recursive CTE on every
 * query or a 1,500-element IN clause from expanding a COUNTRY grant downward.
 *
 * Both importers call `backfillAncestors` at the end, so this standalone entry
 * point is only needed after editing a tree by hand.
 *
 * Done as one recursive CTE per tree rather than a per-row update loop: ~2,800
 * nodes would otherwise be ~2,800 network round trips to Neon.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/** Rebuilds ancestorIds for one self-referencing table. */
async function rebuild(prisma: PrismaClient, table: 'Location' | 'Specialization'): Promise<number> {
  await prisma.$executeRawUnsafe(`
    WITH RECURSIVE chain AS (
      -- Seed: every node is its own first ancestor (depth 1).
      SELECT id AS "rowId", id AS "nodeId", "parentId", 1 AS depth
      FROM "${table}"
      UNION ALL
      -- Walk up one rung at a time until parentId runs out.
      SELECT c."rowId", p.id, p."parentId", c.depth + 1
      FROM chain c
      JOIN "${table}" p ON p.id = c."parentId"
    )
    UPDATE "${table}" t
    SET "ancestorIds" = a.ids
    FROM (
      SELECT "rowId", array_agg("nodeId" ORDER BY depth) AS ids
      FROM chain
      GROUP BY "rowId"
    ) a
    WHERE t.id = a."rowId"
  `);
  const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM "${table}" WHERE cardinality("ancestorIds") > 0`,
  );
  return Number(count);
}

export async function backfillAncestors(prisma: PrismaClient): Promise<void> {
  const locations = await rebuild(prisma, 'Location');
  const specializations = await rebuild(prisma, 'Specialization');
  console.log(`  ancestorIds: ${locations} locations, ${specializations} specializations`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillAncestors(prisma)
    .then(() => console.log('✅ Ancestor paths rebuilt.'))
    .catch((e) => {
      console.error('❌ Backfill failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
