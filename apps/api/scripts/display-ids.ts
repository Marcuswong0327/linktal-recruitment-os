/**
 * Keeps `displayId` sequences honest across the 12 models that carry one.
 *
 * The default on each model (`display_id(prefix, seq)`, see the
 * `display_id_format` migration) only ever *reads* its sequence — nothing
 * about a raw insert or an explicit `displayId` in a `create` advances it.
 * The workbook importer writes explicit displayIds, so its sequences drift
 * behind the table's actual max and the next app-created row collides
 * (`P2002`, surfaced as a generic 500). `resyncDisplayIdSequences` is the fix
 * for that, safe to run any time.
 *
 * `renumberDisplayIds` is the one-off cleanup: it discards every existing
 * displayId and rewrites the whole table densely `1..N`, in the order the
 * rows already carried (so the importer's "earliest sheet row wins" tiebreak
 * survives). Two passes per table because the `displayId` unique index isn't
 * deferred — a direct old-number -> new-number rewrite can collide with a row
 * that hasn't moved yet.
 *
 *   pnpm --filter @linktal/api renumber:display-ids   # destructive, one-off
 *   pnpm --filter @linktal/api resync:display-ids      # safe, idempotent
 *   pnpm --filter @linktal/api resync:display-ids --check   # read-only, exits 1 if lagging
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

type DisplayIdTable = {
  /** Exact Postgres table name — no model in this schema uses @@map. */
  table: string;
  prefix: string;
  sequence: string;
};

export const DISPLAY_ID_TABLES: DisplayIdTable[] = [
  { table: 'Consultant', prefix: 'CST-', sequence: 'Consultant_displayId_seq' },
  { table: 'Client', prefix: 'CLI-', sequence: 'Client_displayId_seq' },
  { table: 'Tob', prefix: 'TOB-', sequence: 'Tob_displayId_seq' },
  { table: 'Stakeholder', prefix: 'STK-', sequence: 'Stakeholder_displayId_seq' },
  { table: 'StakeholderContactHistory', prefix: 'CN-', sequence: 'StakeholderContactHistory_displayId_seq' },
  { table: 'ClientJobResearch', prefix: 'JR-', sequence: 'ClientJobResearch_displayId_seq' },
  { table: 'Candidate', prefix: 'CDD-', sequence: 'Candidate_displayId_seq' },
  { table: 'CandidateContactHistory', prefix: 'CDN-', sequence: 'CandidateContactHistory_displayId_seq' },
  { table: 'JobOrder', prefix: 'JO-', sequence: 'JobOrder_displayId_seq' },
  { table: 'CandidateSubmission', prefix: 'SUB-', sequence: 'CandidateSubmission_displayId_seq' },
  { table: 'Interview', prefix: 'INT-', sequence: 'Interview_displayId_seq' },
  { table: 'Placement', prefix: 'PLC-', sequence: 'Placement_displayId_seq' },
];

/** The numeric part of a `prefix + digits` displayId, as a bigint expression. */
function numericSuffixSql(t: DisplayIdTable): string {
  return `substring("displayId" from ${t.prefix.length + 1})::bigint`;
}

/** Minimal surface both `PrismaClient` and its `$transaction` callback param share. */
type RawExecutor = { $executeRawUnsafe: PrismaClient['$executeRawUnsafe'] };

async function setSequence(db: RawExecutor, sequence: string, count: number): Promise<void> {
  if (count === 0) {
    // No rows yet — next nextval() must return 1, not 2, so is_called stays false.
    await db.$executeRawUnsafe(`SELECT setval('"${sequence}"', 1, false)`);
  } else {
    await db.$executeRawUnsafe(`SELECT setval('"${sequence}"', ${count})`);
  }
}

/**
 * Rewrites one table's displayIds to a dense `prefix + 000001..N`, ordered by
 * the numeric part of the *current* displayId, then advances its sequence to
 * match. Runs inside a transaction so the whole table moves on one
 * connection — required for the temp table, and means a failure leaves the
 * original numbering untouched.
 */
async function renumberOne(prisma: PrismaClient, t: DisplayIdTable): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      CREATE TEMP TABLE _renumber ON COMMIT DROP AS
      SELECT id, row_number() OVER (ORDER BY ${numericSuffixSql(t)}) AS rn
      FROM "${t.table}"
    `);
    // Phase 1: move every row to a value outside the prefix+digits shape, so
    // phase 2's writes can never collide with a row that hasn't moved yet.
    await tx.$executeRawUnsafe(`
      UPDATE "${t.table}" x SET "displayId" = '__renumber__' || r.rn::text
      FROM _renumber r WHERE x.id = r.id
    `);
    await tx.$executeRawUnsafe(
      `UPDATE "${t.table}" x SET "displayId" = $1 || lpad(r.rn::text, 6, '0')
       FROM _renumber r WHERE x.id = r.id`,
      t.prefix,
    );
    const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${t.table}"`);
    const rows = Number(n);
    await setSequence(tx, t.sequence, rows);
    return rows;
  });
}

export async function renumberDisplayIds(prisma: PrismaClient): Promise<void> {
  for (const t of DISPLAY_ID_TABLES) {
    const rows = await renumberOne(prisma, t);
    console.log(`  ${t.table.padEnd(28)} renumbered ${rows} rows -> ${t.sequence} at ${rows}`);
  }
}

/** Advances one table's sequence to its current max, without touching any row. */
async function resyncOne(prisma: PrismaClient, t: DisplayIdTable): Promise<{ maxNum: number | null }> {
  const [{ maxnum }] = await prisma.$queryRawUnsafe<{ maxnum: bigint | null }[]>(
    `SELECT max(${numericSuffixSql(t)}) AS maxnum FROM "${t.table}"`,
  );
  await setSequence(prisma, t.sequence, maxnum === null ? 0 : Number(maxnum));
  return { maxNum: maxnum === null ? null : Number(maxnum) };
}

export async function resyncDisplayIdSequences(prisma: PrismaClient): Promise<void> {
  for (const t of DISPLAY_ID_TABLES) {
    const { maxNum } = await resyncOne(prisma, t);
    console.log(`  ${t.table.padEnd(28)} max=${maxNum ?? '-'} -> ${t.sequence} next=${maxNum === null ? 1 : maxNum + 1}`);
  }
}

export type SequenceLag = { table: string; sequence: string; maxNum: number; seqNext: number };

/** Read-only: returns every table whose sequence would collide on the next insert. */
export async function checkDisplayIdSequences(prisma: PrismaClient): Promise<SequenceLag[]> {
  const lagging: SequenceLag[] = [];
  for (const t of DISPLAY_ID_TABLES) {
    const [{ maxnum }] = await prisma.$queryRawUnsafe<{ maxnum: bigint | null }[]>(
      `SELECT max(${numericSuffixSql(t)}) AS maxnum FROM "${t.table}"`,
    );
    if (maxnum === null) continue;
    const [{ last_value, is_called }] = await prisma.$queryRawUnsafe<{ last_value: bigint; is_called: boolean }[]>(
      `SELECT last_value, is_called FROM "${t.sequence}"`,
    );
    const seqNext = last_value + (is_called ? 1n : 0n);
    if (seqNext <= maxnum) {
      lagging.push({ table: t.table, sequence: t.sequence, maxNum: Number(maxnum), seqNext: Number(seqNext) });
    }
  }
  return lagging;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  const CHECK = process.argv.includes('--check');
  const RENUMBER = process.argv.includes('--renumber');

  (async () => {
    if (RENUMBER) {
      console.log('🔢 Renumbering displayIds to 1..N per table (existing IDs are discarded)...\n');
      await renumberDisplayIds(prisma);
      console.log('\n✅ Renumbered.');
      return;
    }
    if (CHECK) {
      const lagging = await checkDisplayIdSequences(prisma);
      if (lagging.length === 0) {
        console.log('✅ All displayId sequences are ahead of their table max.');
        return;
      }
      console.error('❌ Sequences lagging behind their table max (next insert will collide):');
      for (const l of lagging) console.error(`  ${l.table}: ${l.sequence} next=${l.seqNext} <= max=${l.maxNum}`);
      process.exitCode = 1;
      return;
    }
    console.log('🔄 Resyncing displayId sequences to each table\'s current max...\n');
    await resyncDisplayIdSequences(prisma);
    console.log('\n✅ Resynced.');
  })()
    .catch((e) => {
      console.error('❌ Failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
