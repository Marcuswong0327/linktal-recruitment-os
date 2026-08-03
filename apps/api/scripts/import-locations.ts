/**
 * Loads the Location tree from GeoNames — COUNTRY -> STATE -> CITY.
 *
 *   pnpm --filter @linktal/api import:locations
 *
 * Suburbs are a later phase: they come from the postal-code dumps (AU.zip /
 * MY.zip), which carry the postcode this tree's SUBURB level expects. Malaysian
 * postal coverage in GeoNames is noticeably thinner than Australian, so that
 * needs verifying before we lean on it.
 *
 * Source files live in `data/geonames` (see DATA_DIR); download them with:
 *   curl -O https://download.geonames.org/export/dump/countryInfo.txt
 *   curl -O https://download.geonames.org/export/dump/admin1CodesASCII.txt
 *   curl -O https://download.geonames.org/export/dump/cities5000.zip && unzip cities5000.zip
 *
 * Idempotent: every node is matched on its GeoNames id, so re-running updates
 * in place rather than duplicating. Nothing here is ever hand-typed —
 * `location:create` is admin-only precisely so this stays the only writer.
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, LocationLevel } from '@prisma/client';
import { DATA_DIR } from './data-dir';
import { backfillAncestors } from './backfill-ancestors';

const prisma = new PrismaClient();

// The countries Linktal operates in. Adding a third means adding it here and
// re-running — plus re-granting any consultant who was assigned "All".
const COUNTRIES = ['AU', 'MY'] as const;

const GEONAMES_DIR = path.join(DATA_DIR, 'geonames');
const file = (name: string) => path.join(GEONAMES_DIR, name);

/** Reads a GeoNames TSV, dropping comment lines and blanks. */
function readTsv(name: string): string[][] {
  const full = file(name);
  if (!fs.existsSync(full)) {
    throw new Error(
      `Missing ${full}. Download the GeoNames files into ${GEONAMES_DIR} first — see the header of this script.`,
    );
  }
  return fs
    .readFileSync(full, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => line.split('\t'));
}

async function upsertNode(input: {
  geonameId: number;
  name: string;
  level: LocationLevel;
  parentId: string | null;
}): Promise<string> {
  const row = await prisma.location.upsert({
    where: { geonameId: input.geonameId },
    update: { name: input.name, level: input.level, parentId: input.parentId },
    create: {
      geonameId: input.geonameId,
      name: input.name,
      level: input.level,
      parentId: input.parentId,
    },
    select: { id: true },
  });
  return row.id;
}

async function main() {
  console.log('🌍 Loading Location tree from GeoNames...\n');

  // ---- COUNTRY ------------------------------------------------------------
  // countryInfo.txt: [0] iso, [4] name, [16] geonameid
  const countryIdByIso = new Map<string, string>();
  for (const cols of readTsv('countryInfo.txt')) {
    const iso = cols[0];
    if (!COUNTRIES.includes(iso as (typeof COUNTRIES)[number])) continue;
    const id = await upsertNode({
      geonameId: Number(cols[16]),
      name: cols[4],
      level: LocationLevel.COUNTRY,
      parentId: null,
    });
    countryIdByIso.set(iso, id);
    console.log(`  COUNTRY  ${cols[4]}`);
  }
  if (countryIdByIso.size !== COUNTRIES.length) {
    throw new Error(`Expected ${COUNTRIES.length} countries, resolved ${countryIdByIso.size}`);
  }

  // ---- STATE (admin1) -----------------------------------------------------
  // admin1CodesASCII.txt: [0] "AU.02", [1] name, [3] geonameid
  const stateIdByCode = new Map<string, string>();
  for (const cols of readTsv('admin1CodesASCII.txt')) {
    const [iso, adminCode] = cols[0].split('.');
    const countryId = countryIdByIso.get(iso);
    if (!countryId || !adminCode) continue;
    const id = await upsertNode({
      geonameId: Number(cols[3]),
      name: cols[1],
      level: LocationLevel.STATE,
      parentId: countryId,
    });
    stateIdByCode.set(cols[0], id);
  }
  console.log(`  STATE    ${stateIdByCode.size} loaded`);

  // ---- CITY ---------------------------------------------------------------
  // cities5000.txt: [0] geonameid, [1] name, [8] country, [10] admin1, [14] population
  //
  // A handful of names collide inside one state (two "Figtree" in NSW, two
  // "Red Hill" in QLD) and `@@unique([parentId, name])` won't take both — keep
  // the larger by population, which is the one anyone means.
  type CityRow = { geonameId: number; name: string; stateCode: string; population: number };
  const bestByKey = new Map<string, CityRow>();
  for (const cols of readTsv('cities5000.txt')) {
    const iso = cols[8];
    if (!COUNTRIES.includes(iso as (typeof COUNTRIES)[number])) continue;
    const stateCode = `${iso}.${cols[10]}`;
    if (!stateIdByCode.has(stateCode)) continue; // city in a territory we didn't load
    const row: CityRow = {
      geonameId: Number(cols[0]),
      name: cols[1],
      stateCode,
      population: Number(cols[14]) || 0,
    };
    const key = `${stateCode}|${row.name}`;
    const existing = bestByKey.get(key);
    if (!existing || row.population > existing.population) bestByKey.set(key, row);
  }

  let cityCount = 0;
  for (const city of bestByKey.values()) {
    await upsertNode({
      geonameId: city.geonameId,
      name: city.name,
      level: LocationLevel.CITY,
      parentId: stateIdByCode.get(city.stateCode) as string,
    });
    cityCount += 1;
  }
  console.log(`  CITY     ${cityCount} loaded`);

  await backfillAncestors(prisma);

  const total = await prisma.location.count();
  console.log(`\n✅ Location tree loaded — ${total} nodes total.`);
}

main()
  .catch((e) => {
    console.error('❌ Location import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
