import { PrismaClient } from '@prisma/client';

/**
 * The 12 models whose `displayId` is assigned by a Postgres sequence (see the
 * `display_id_format` migration). Mirrors `apps/api/scripts/display-ids.ts` —
 * duplicated rather than imported because that script lives outside `src/`
 * (`tsconfig.json` only includes `src/**\/*`, so `nest build` can't follow an
 * import that crosses out of it without breaking `dist`'s layout).
 */
const DISPLAY_ID_TABLES: { table: string; prefix: string; sequence: string }[] = [
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

export type SequenceLag = { table: string; sequence: string; maxNum: number; seqNext: number };

/**
 * Read-only: returns every table whose displayId sequence sits at or behind
 * its table's current max — the state that makes the next app-created row on
 * that table collide (`P2002`, a generic 500 via `AllExceptionsFilter`).
 *
 * Fixed with `pnpm --filter @linktal/api resync:display-ids`.
 */
export async function checkDisplayIdSequences(prisma: PrismaClient): Promise<SequenceLag[]> {
  const lagging: SequenceLag[] = [];
  for (const t of DISPLAY_ID_TABLES) {
    const [{ maxnum }] = await prisma.$queryRawUnsafe<{ maxnum: bigint | null }[]>(
      `SELECT max(substring("displayId" from ${t.prefix.length + 1})::bigint) AS maxnum FROM "${t.table}"`,
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
