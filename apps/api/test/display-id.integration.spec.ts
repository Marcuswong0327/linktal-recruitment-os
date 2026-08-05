/**
 * Integration test for displayId generation — hits the real dev database,
 * unlike every spec under `src/` (those construct services with
 * `{} as unknown as PrismaService` and never touch Postgres). Not part of
 * `pnpm test`; run explicitly with `pnpm test:integration`. Needs the same
 * `DATABASE_URL`/`DIRECT_URL` as any other script in this package.
 *
 * For each of the 12 models carrying a displayId, creates one throwaway row
 * through Prisma — exercising the real `display_id()` Postgres default, not
 * a mock — and asserts it lands on the expected dense `prefix + (max+1)`
 * value. Every row created here is deleted in `afterAll` and each table's
 * sequence is reset to its pre-test value, so the database is left exactly
 * as found; `afterAll` re-snapshots row counts and asserts they match what
 * `beforeAll` recorded, so a cleanup gap fails the suite instead of silently
 * leaving rows behind. Fixture rows carry a distinctive marker so a crashed
 * prior run's leftovers are swept up automatically on the next run.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { checkDisplayIdSequences } from '../src/prisma/display-id-sequences';

const MARKER = '__displayid_integration_test__';
const MARKER_EMAIL = 'displayid-integration-test@example.invalid';

const prisma = new PrismaClient();

const SEQUENCED_TABLES = [
  'Consultant',
  'Client',
  'Tob',
  'Stakeholder',
  'StakeholderContactHistory',
  'ClientJobResearch',
  'Candidate',
  'CandidateContactHistory',
  'JobOrder',
  'CandidateSubmission',
  'Interview',
  'Placement',
] as const;

/** Reads the current max numeric suffix and computes the id this table's next insert must produce. */
async function nextExpected(table: string, prefix: string): Promise<{ maxBefore: number; expected: string }> {
  const [{ maxnum }] = await prisma.$queryRawUnsafe<{ maxnum: bigint | null }[]>(
    `SELECT max(substring("displayId" from ${prefix.length + 1})::bigint) AS maxnum FROM "${table}"`,
  );
  const maxBefore = maxnum === null ? 0 : Number(maxnum);
  return { maxBefore, expected: `${prefix}${String(maxBefore + 1).padStart(6, '0')}` };
}

async function resetSequence(sequence: string, maxBefore: number): Promise<void> {
  if (maxBefore === 0) {
    await prisma.$executeRawUnsafe(`SELECT setval('"${sequence}"', 1, false)`);
  } else {
    await prisma.$executeRawUnsafe(`SELECT setval('"${sequence}"', ${maxBefore})`);
  }
}

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of SEQUENCED_TABLES) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`);
    counts[table] = Number(n);
  }
  return counts;
}

/** Sweeps up a previous crashed run's leftovers — deleting the two roots cascades everything under them. */
async function cleanupMarkedFixtures(): Promise<void> {
  await prisma.consultant.deleteMany({ where: { email: MARKER_EMAIL } });
  await prisma.client.deleteMany({ where: { companyName: MARKER } });
  await prisma.candidate.deleteMany({ where: { firstName: MARKER } });
}

type Created = { table: string; prefix: string; sequence: string; id: string; displayId: string; expected: string; maxBefore: number };

describe('displayId generation (real DB)', () => {
  let countsBefore: Record<string, number>;
  const created: Created[] = [];

  beforeAll(async () => {
    countsBefore = await rowCounts();
    await cleanupMarkedFixtures();

    const industry = await prisma.industry.findFirst({ select: { id: true } });
    const location = await prisma.location.findFirst({ select: { id: true } });
    if (!industry || !location) {
      throw new Error('Fixture data missing: need at least one Industry and Location row in the DB to run this test.');
    }

    async function create<T extends { id: string; displayId: string }>(
      table: string,
      prefix: string,
      sequence: string,
      fn: () => Promise<T>,
    ): Promise<T> {
      const { maxBefore, expected } = await nextExpected(table, prefix);
      const row = await fn();
      created.push({ table, prefix, sequence, id: row.id, displayId: row.displayId, expected, maxBefore });
      return row;
    }

    await create('Consultant', 'CST-', 'Consultant_displayId_seq', () =>
      prisma.consultant.create({ data: { fullName: MARKER, email: MARKER_EMAIL }, select: { id: true, displayId: true } }),
    );

    const client = await create('Client', 'CLI-', 'Client_displayId_seq', () =>
      prisma.client.create({ data: { companyName: MARKER, industryId: industry.id }, select: { id: true, displayId: true } }),
    );

    const candidate = await create('Candidate', 'CDD-', 'Candidate_displayId_seq', () =>
      prisma.candidate.create({
        data: { firstName: MARKER, lastName: 'Fixture', industryId: industry.id, locationId: location.id },
        select: { id: true, displayId: true },
      }),
    );

    const jobOrder = await create('JobOrder', 'JO-', 'JobOrder_displayId_seq', () =>
      prisma.jobOrder.create({ data: { clientId: client.id, notes: MARKER }, select: { id: true, displayId: true } }),
    );

    const stakeholder = await create('Stakeholder', 'STK-', 'Stakeholder_displayId_seq', () =>
      prisma.stakeholder.create({
        data: { clientId: client.id, firstName: MARKER },
        select: { id: true, displayId: true },
      }),
    );

    await create('Tob', 'TOB-', 'Tob_displayId_seq', () =>
      prisma.tob.create({ data: { clientId: client.id, fileName: MARKER }, select: { id: true, displayId: true } }),
    );

    await create('ClientJobResearch', 'JR-', 'ClientJobResearch_displayId_seq', () =>
      prisma.clientJobResearch.create({ data: { clientId: client.id, seekUrl: MARKER }, select: { id: true, displayId: true } }),
    );

    await create('CandidateContactHistory', 'CDN-', 'CandidateContactHistory_displayId_seq', () =>
      prisma.candidateContactHistory.create({
        data: { candidateId: candidate.id, category: MARKER },
        select: { id: true, displayId: true },
      }),
    );

    await create('StakeholderContactHistory', 'CN-', 'StakeholderContactHistory_displayId_seq', () =>
      prisma.stakeholderContactHistory.create({
        data: { stakeholderId: stakeholder.id, notes: MARKER },
        select: { id: true, displayId: true },
      }),
    );

    const submission = await create('CandidateSubmission', 'SUB-', 'CandidateSubmission_displayId_seq', () =>
      prisma.candidateSubmission.create({
        data: { candidateId: candidate.id, jobOrderId: jobOrder.id, notes: MARKER },
        select: { id: true, displayId: true },
      }),
    );

    await create('Interview', 'INT-', 'Interview_displayId_seq', () =>
      prisma.interview.create({
        data: { submissionId: submission.id, roundLabel: MARKER, interviewDate: new Date() },
        select: { id: true, displayId: true },
      }),
    );

    await create('Placement', 'PLC-', 'Placement_displayId_seq', () =>
      prisma.placement.create({ data: { submissionId: submission.id }, select: { id: true, displayId: true } }),
    );
  });

  afterAll(async () => {
    // Leaf-to-root: Placement/Interview/CandidateSubmission before their
    // Candidate/JobOrder parents, StakeholderContactHistory before
    // Stakeholder, everything before Client.
    const deleteOrder = [
      'Placement',
      'Interview',
      'CandidateSubmission',
      'StakeholderContactHistory',
      'CandidateContactHistory',
      'ClientJobResearch',
      'Tob',
      'Stakeholder',
      'JobOrder',
      'Candidate',
      'Client',
      'Consultant',
    ];
    for (const table of deleteOrder) {
      const row = created.find((c) => c.table === table);
      if (!row) continue;
      await prisma.$executeRawUnsafe(`DELETE FROM "${row.table}" WHERE id = $1`, row.id);
    }
    for (const row of created) {
      await resetSequence(row.sequence, row.maxBefore);
    }

    const countsAfter = await rowCounts();
    expect(countsAfter).toEqual(countsBefore);

    await prisma.$disconnect();
  });

  it.each(SEQUENCED_TABLES)('%s gets a dense, correctly-prefixed displayId on create', (table) => {
    const row = created.find((c) => c.table === table);
    expect(row).toBeDefined();
    expect(row!.displayId).toBe(row!.expected);
  });

  it('leaves every displayId sequence ahead of its table max', async () => {
    const lagging = await checkDisplayIdSequences(prisma);
    expect(lagging).toEqual([]);
  });
});
