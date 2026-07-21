import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Not PII (a generic industry taxonomy), so unlike the Excel imports in
// apps/api/data/ (git-ignored) this file lives in the repo.
const INDUSTRIES_FILE = path.join(__dirname, 'seed-data', 'industries.csv');

/** One name per line, `Name,` (Excel-exported single-column CSV with a trailing comma) — strip the comma, trim, drop the header/blank lines. */
function parseIndustryNames(csv: string): string[] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.replace(/,\s*$/, '').trim())
    .filter((name) => name.length > 0 && name.toLowerCase() !== 'industry');
}

async function main() {
  const csv = fs.readFileSync(INDUSTRIES_FILE, 'utf-8');
  const names = parseIndustryNames(csv);

  console.log(`🌱 Importing ${names.length} industries...\n`);

  let created = 0;
  for (const name of names) {
    const existing = await prisma.industry.findUnique({ where: { name } });
    if (!existing) created += 1;
    await prisma.industry.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log(`✓ Done — ${created} created, ${names.length - created} already existed.`);
}

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
