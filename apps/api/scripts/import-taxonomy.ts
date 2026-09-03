/**
 * Seeds the scope-bearing taxonomy — Industry and the two-tier Specialization
 * tree — from every tab that mentions one.
 *
 *   pnpm --filter @linktal/api import:taxonomy
 *
 * Idempotent: everything is upserted by name.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readSheet, norm, splitList, isWildcard, RejectReport } from './workbook';
import { backfillAncestors } from './backfill-ancestors';
import {
  SPECIALIZATION_CATEGORIES,
  canonicalIndustry,
  categoryFor,
  candidateSpecializationValue,
} from './seed-data/specialization-categories';

const prisma = new PrismaClient();

// Column indexes, by sheet.
const CLIENT_INDUSTRY = 3;
const CLIENT_SPECIALIZATION = 4;
const CANDIDATE_INDUSTRY = 2;
const CANDIDATE_SPECIALIZATION = 6;
const USER_INDUSTRY = 4;
const USER_SPECIALIZATION = 5;

async function main() {
  const rejects = new RejectReport();
  console.log('🏷️  Seeding taxonomy...\n');

  // ---- Industries ---------------------------------------------------------
  // Union of every tab that names one, folded to canonical spellings. The User
  // List contributes "Equipment", which no client or candidate carries yet.
  const industryNames = new Set<string>(Object.keys(SPECIALIZATION_CATEGORIES));

  const collectIndustries = async (
    sheet: Parameters<typeof readSheet>[0],
    column: number,
    label: string,
    // Client/Candidate carry a single industry, and its canonical spelling can
    // itself contain a semicolon ("Banking; Financial Services") — splitting
    // those would tear one industry into two unknown halves. Only the User
    // List's industry *priorities* are genuinely multi-valued.
    multiValued: boolean,
  ) => {
    const { rows } = await readSheet(sheet);
    for (const row of rows) {
      const values = multiValued ? splitList(row.cells[column]) : [norm(row.cells[column])];
      for (const raw of values) {
        if (!raw || isWildcard(raw)) continue;
        const canonical = canonicalIndustry(raw);
        if (canonical) industryNames.add(canonical);
        else rejects.add(label, row.rowNumber, 'industry', raw, 'unknown industry');
      }
    }
  };
  await collectIndustries('clients', CLIENT_INDUSTRY, 'Client(Company)', false);
  await collectIndustries('candidates', CANDIDATE_INDUSTRY, 'Candidate (Info)', false);
  await collectIndustries('users', USER_INDUSTRY, 'User List', true);

  const industryIdByName = new Map<string, string>();
  for (const name of [...industryNames].sort()) {
    const row = await prisma.industry.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    industryIdByName.set(name, row.id);
  }
  console.log(`  Industry        ${industryIdByName.size} — ${[...industryIdByName.keys()].join(', ')}`);

  // ---- Specialization categories (the parent tier) ------------------------
  // Created first so leaves have something to hang off. Keyed by
  // "<industry>|<category>" because a name is only unique within an industry.
  const categoryIdByKey = new Map<string, string>();
  for (const [industry, categories] of Object.entries(SPECIALIZATION_CATEGORIES)) {
    const industryId = industryIdByName.get(industry);
    if (!industryId) continue;
    for (const name of categories) {
      const row = await prisma.specialization.upsert({
        where: { industryId_name: { industryId, name } },
        update: {},
        create: { industryId, name, parentId: null },
        select: { id: true },
      });
      categoryIdByKey.set(`${industry}|${name}`, row.id);
    }
  }
  console.log(`  Categories      ${categoryIdByKey.size}`);

  // ---- Specialization leaves ----------------------------------------------
  // Collected as (industry, value) pairs first, so each leaf is created once
  // even when several clients or candidates carry it.
  const leaves = new Set<string>();

  const { rows: clientRows } = await readSheet('clients');
  for (const row of clientRows) {
    const industryRaw = norm(row.cells[CLIENT_INDUSTRY]);
    const specRaw = norm(row.cells[CLIENT_SPECIALIZATION]);
    if (!industryRaw || !specRaw) continue;
    const industry = canonicalIndustry(industryRaw);
    if (!industry) continue;
    leaves.add(`${industry}|${specRaw}`);
  }

  const { rows: candidateRows } = await readSheet('candidates');
  for (const row of candidateRows) {
    const industryRaw = norm(row.cells[CANDIDATE_INDUSTRY]);
    const specRaw = norm(row.cells[CANDIDATE_SPECIALIZATION]);
    if (!industryRaw || !specRaw) continue;
    const industry = canonicalIndustry(industryRaw);
    if (!industry) continue;
    // Construction rows pack role + sector + state into this cell; only the
    // sector is a specialization (see candidateSpecializationValue).
    leaves.add(`${industry}|${candidateSpecializationValue(specRaw)}`);
  }

  // Consultant priorities are coarse ("Food", "Class 2") and usually *are*
  // categories — but seed any that aren't, so a grant never dangles.
  const { rows: userRows } = await readSheet('users');
  for (const row of userRows) {
    if (isWildcard(row.cells[USER_SPECIALIZATION])) continue;
    const industries = splitList(row.cells[USER_INDUSTRY])
      .map(canonicalIndustry)
      .filter((i): i is string => i !== null);
    for (const raw of splitList(row.cells[USER_SPECIALIZATION])) {
      for (const industry of industries) {
        if (categoryFor(industry, raw)) leaves.add(`${industry}|${raw}`);
      }
    }
  }

  let leafCount = 0;
  let parented = 0;
  for (const key of [...leaves].sort()) {
    const [industry, name] = key.split('|');
    const industryId = industryIdByName.get(industry);
    if (!industryId) continue;
    const category = categoryFor(industry, name);
    // A value that *is* its category was already created above — skip rather
    // than trying to make it its own parent.
    if (category && category.toLowerCase() === name.toLowerCase()) continue;
    const parentId = category ? (categoryIdByKey.get(`${industry}|${category}`) ?? null) : null;
    await prisma.specialization.upsert({
      where: { industryId_name: { industryId, name } },
      update: { parentId },
      create: { industryId, name, parentId },
    });
    leafCount += 1;
    if (parentId) parented += 1;
  }
  console.log(`  Specializations ${leafCount} leaves (${parented} parented, ${leafCount - parented} top-level)`);

  await backfillAncestors(prisma);

  const total = await prisma.specialization.count();
  console.log(`\n✅ Taxonomy seeded — ${industryIdByName.size} industries, ${total} specializations.`);
  rejects.print();
}

main()
  .catch((e) => {
    console.error('❌ Taxonomy import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
