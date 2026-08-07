/**
 * Seeds Consultants from the User List tab, including the reporting hierarchy
 * and all three arms of their visibility scope.
 *
 *   pnpm --filter @linktal/api import:users
 *
 * Run after `seed` (roles), `import:locations` and `import:taxonomy`.
 *
 * The interesting part is the **per-parent wildcard rule**, which is what makes
 * a two-column "Country Priority / City Priority" pair mean what the business
 * intends:
 *
 *   for each country listed:
 *     cities listed under THAT country?  -> grant those cities
 *     none listed under that country?    -> grant the whole country
 *
 * So Karen Lin (Australia / Sydney NSW) is scoped to Sydney, while Daniel Kee
 * (Malaysia; Australia / Klang Valley; East Malaysia) gets the two Malaysian
 * desks *plus the whole of Australia*, because Australia had no cities against
 * it. Industry/Specialization resolve by exactly the same rule.
 *
 * A city that isn't under any listed country is a reject, not a silent grant.
 */
import 'dotenv/config';
import { PrismaClient, LocationLevel } from '@prisma/client';
import { resyncDisplayIdSequences } from './display-ids';
import { readSheet, norm, splitList, isWildcard, parseRowLink, RejectReport } from './workbook';
import { resolveAlias, AliasTarget } from './seed-data/location-aliases';
import { canonicalIndustry, categoryFor } from './seed-data/specialization-categories';

const prisma = new PrismaClient();
const SHEET = 'User List';

const NAME = 1, POSITION = 2, COUNTRY = 3, INDUSTRY = 4, SPECIALIZATION = 5, CITY = 6, SALARY = 7, REPORTS_TO = 8, COST_TO = 9;

/**
 * Corrections applied to the source workbook, keyed by spreadsheet row.
 *
 * Row 9 (Wong Yuen Xing) lists Country "Australia" but Cities "West Malaysia;
 * East Malaysia" — the cities aren't under the listed country, so the
 * validation rule rejected all 16 expanded nodes and the grant collapsed to
 * Australia alone. Confirmed with the business that Malaysia belongs in their
 * country list.
 *
 * Delete an entry once the sheet itself is fixed; it's a no-op either way,
 * since the value is merged rather than replaced.
 */
const ROW_CORRECTIONS: Record<number, { countries?: string[] }> = {
  9: { countries: ['Malaysia'] },
};

/**
 * Position -> RBAC role. Seniority ("Senior", "Associate", "Intern") is not a
 * permission concept: it's carried as the consultant's JobTitle instead, so
 * "Consultant (Intern)" and "Consultant (Senior)" both authorize identically.
 * Anything unmapped is treated as a note row rather than a person.
 */
const ROLE_BY_POSITION: Record<string, string> = {
  manager: 'manager',
  consultant: 'consultant',
  'consultant (senior)': 'consultant',
  'consultant (associate)': 'consultant',
  'consultant (intern)': 'consultant',
  researcher: 'researcher',
  'researcher (intern)': 'researcher',
  'support (finance)': 'finance',
  'support (it)': 'admin',
};

/** The workbook carries no email column; Linktal's convention is first.last@. */
function emailFor(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('.');
  return `${slug}@linktal.com.au`;
}

type UserRow = {
  rowNumber: number;
  fullName: string;
  position: string;
  roleName: string;
  email: string;
  salary: number | null;
  costTo: string | null;
  reportsToRow: number | null;
  reportsToName: string | null;
  countries: string[];
  cities: string[];
  industries: string[];
  specializations: string[];
  countryWildcard: boolean;
  cityWildcard: boolean;
  industryWildcard: boolean;
  specializationWildcard: boolean;
};

async function main() {
  const rejects = new RejectReport();
  console.log('👥 Seeding consultants from the User List...\n');

  const { rows } = await readSheet('users');

  // ---- Parse, dropping the tab's trailing annotation rows -----------------
  const users: UserRow[] = [];
  for (const row of rows) {
    const fullName = norm(row.cells[NAME]);
    const position = norm(row.cells[POSITION]);
    if (!fullName || !position) continue;
    const roleName = ROLE_BY_POSITION[position.toLowerCase()];
    if (!roleName) continue; // annotation row ("Admin", "Specialisation is tags", ...)

    const link = parseRowLink(row.cells[REPORTS_TO]);
    const correction = ROW_CORRECTIONS[row.rowNumber];
    const countries = isWildcard(row.cells[COUNTRY]) ? [] : splitList(row.cells[COUNTRY]);
    if (correction?.countries) {
      for (const extra of correction.countries) {
        if (!countries.some((c) => c.toLowerCase() === extra.toLowerCase())) countries.push(extra);
      }
      console.log(`  ⓘ row ${row.rowNumber} (${fullName}): applied country correction → ${countries.join(', ')}`);
    }
    users.push({
      rowNumber: row.rowNumber,
      fullName,
      position,
      roleName,
      email: emailFor(fullName),
      salary: typeof row.cells[SALARY] === 'number' ? (row.cells[SALARY] as number) : null,
      costTo: norm(row.cells[COST_TO]),
      reportsToRow: link.rowNumber,
      reportsToName: link.name && link.name.toUpperCase() !== 'NA' ? link.name : null,
      countries,
      cities: isWildcard(row.cells[CITY]) ? [] : splitList(row.cells[CITY]),
      industries: isWildcard(row.cells[INDUSTRY]) ? [] : splitList(row.cells[INDUSTRY]),
      specializations: isWildcard(row.cells[SPECIALIZATION]) ? [] : splitList(row.cells[SPECIALIZATION]),
      countryWildcard: isWildcard(row.cells[COUNTRY]),
      cityWildcard: isWildcard(row.cells[CITY]),
      industryWildcard: isWildcard(row.cells[INDUSTRY]),
      specializationWildcard: isWildcard(row.cells[SPECIALIZATION]),
    });
  }
  console.log(`  Parsed ${users.length} users\n`);

  // ---- Reference data -----------------------------------------------------
  const roleIdByName = new Map(
    (await prisma.role.findMany({ select: { id: true, name: true } })).map((r) => [r.name, r.id]),
  );
  const allCountries = await prisma.location.findMany({
    where: { level: LocationLevel.COUNTRY },
    select: { id: true, name: true },
  });
  const industries = await prisma.industry.findMany({ select: { id: true, name: true } });
  const specializations = await prisma.specialization.findMany({
    select: { id: true, name: true, industryId: true },
  });

  /** Resolves an alias target to a Location id, disambiguating by level. */
  const locationId = async (target: AliasTarget): Promise<string | null> => {
    const row = await prisma.location.findFirst({
      where: { name: target.name, level: target.level as LocationLevel },
      select: { id: true },
    });
    return row?.id ?? null;
  };

  /** Walks a Location up its parent chain to the COUNTRY node. */
  const countryOf = async (id: string): Promise<string | null> => {
    let current: { id: string; parentId: string | null; level: LocationLevel } | null =
      await prisma.location.findUnique({
        where: { id },
        select: { id: true, parentId: true, level: true },
      });
    while (current && current.level !== LocationLevel.COUNTRY) {
      if (!current.parentId) return null;
      current = await prisma.location.findUnique({
        where: { id: current.parentId },
        select: { id: true, parentId: true, level: true },
      });
    }
    return current?.id ?? null;
  };

  // ---- Pass 1: consultants ------------------------------------------------
  const idByRow = new Map<number, string>();
  const idByName = new Map<string, string>();
  for (const user of users) {
    const jobTitle = await prisma.jobTitle.upsert({
      where: { name: user.position },
      update: {},
      create: { name: user.position },
      select: { id: true },
    });
    const consultant = await prisma.consultant.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        roleId: roleIdByName.get(user.roleName) ?? null,
        jobTitleId: jobTitle.id,
        salary: user.salary,
        costTo: user.costTo,
      },
      create: {
        email: user.email,
        fullName: user.fullName,
        roleId: roleIdByName.get(user.roleName) ?? null,
        jobTitleId: jobTitle.id,
        salary: user.salary,
        costTo: user.costTo,
      },
      select: { id: true, displayId: true },
    });
    idByRow.set(user.rowNumber, consultant.id);
    idByName.set(user.fullName.toLowerCase(), consultant.id);
    console.log(`  ${consultant.displayId}  ${user.fullName.padEnd(18)} ${user.roleName.padEnd(11)} ${user.position}`);
  }

  // ---- Pass 2: reporting hierarchy ---------------------------------------
  // Two passes because "Report to" points at rows that may not exist yet.
  // Prefer the row reference; fall back to the name when the cell has only one
  // ("Chen Yu" with no row number appears on several rows).
  let wired = 0;
  for (const user of users) {
    const targetId =
      (user.reportsToRow !== null ? idByRow.get(user.reportsToRow) : undefined) ??
      (user.reportsToName ? idByName.get(user.reportsToName.toLowerCase()) : undefined);
    if (!targetId) {
      if (user.reportsToName) {
        rejects.add(SHEET, user.rowNumber, 'Report to', user.reportsToName, 'unresolved manager');
      }
      continue;
    }
    const selfId = idByRow.get(user.rowNumber);
    if (targetId === selfId) {
      rejects.add(SHEET, user.rowNumber, 'Report to', user.reportsToName, 'self-reference');
      continue;
    }
    await prisma.consultant.update({ where: { id: selfId }, data: { reportsToId: targetId } });
    wired += 1;
  }
  console.log(`\n  Hierarchy: ${wired} reporting links wired`);

  // ---- Pass 3: scope grants ----------------------------------------------
  let industryGrants = 0, specializationGrants = 0, locationGrants = 0;

  for (const user of users) {
    const consultantId = idByRow.get(user.rowNumber) as string;

    // --- Industry arm ---
    const grantedIndustries = user.industryWildcard
      ? industries
      : industries.filter((i) =>
          user.industries.some((raw) => canonicalIndustry(raw) === i.name),
        );
    for (const raw of user.industries) {
      if (!canonicalIndustry(raw)) {
        rejects.add(SHEET, user.rowNumber, 'Industry Priority', raw, 'unknown industry');
      }
    }
    for (const industry of grantedIndustries) {
      await prisma.consultantIndustry.upsert({
        where: { consultantId_industryId: { consultantId, industryId: industry.id } },
        update: {},
        create: { consultantId, industryId: industry.id },
      });
      industryGrants += 1;
    }

    // --- Specialization arm (narrows the industry arm, per industry) ---
    if (!user.specializationWildcard) {
      for (const industry of grantedIndustries) {
        for (const raw of user.specializations) {
          // Match the category first (that's what a coarse grant means), then
          // fall back to an exact leaf of the same name.
          const categoryName = categoryFor(industry.name, raw);
          const match = specializations.find(
            (s) =>
              s.industryId === industry.id &&
              s.name.toLowerCase() === (categoryName ?? raw).toLowerCase(),
          );
          if (!match) continue; // belongs to one of the user's other industries
          await prisma.consultantSpecialization.upsert({
            where: {
              consultantId_specializationId: { consultantId, specializationId: match.id },
            },
            update: {},
            create: { consultantId, specializationId: match.id },
          });
          specializationGrants += 1;
        }
      }
    }

    // --- Location arm (the per-country wildcard rule) ---
    const countryIds = user.countryWildcard
      ? allCountries.map((c) => c.id)
      : (
          await Promise.all(
            user.countries.map(async (raw) => {
              const targets = resolveAlias(raw);
              if (!targets) {
                rejects.add(SHEET, user.rowNumber, 'Country Priority', raw, 'unknown country');
                return null;
              }
              return Promise.all(targets.map(locationId));
            }),
          )
        )
          .flat(2)
          .filter((id): id is string => id !== null);

    // Resolve each listed city, then bucket it under the country it sits in.
    const citiesByCountry = new Map<string, string[]>();
    if (!user.cityWildcard) {
      for (const raw of user.cities) {
        const targets = resolveAlias(raw);
        if (!targets) {
          rejects.add(SHEET, user.rowNumber, 'City Priority', raw, 'unknown city/desk');
          continue;
        }
        for (const target of targets) {
          const id = await locationId(target);
          if (!id) {
            rejects.add(SHEET, user.rowNumber, 'City Priority', `${target.level}:${target.name}`, 'no such location node');
            continue;
          }
          const country = await countryOf(id);
          if (!country || !countryIds.includes(country)) {
            // The rule you asked for: a city must sit under a listed country.
            rejects.add(SHEET, user.rowNumber, 'City Priority', raw, 'city not under any listed country');
            continue;
          }
          const list = citiesByCountry.get(country) ?? [];
          list.push(id);
          citiesByCountry.set(country, list);
        }
      }
    }

    // Per country: grant its listed cities, or the country itself if none.
    const grants = new Set<string>();
    for (const countryId of countryIds) {
      const cities = citiesByCountry.get(countryId);
      if (cities && cities.length > 0) cities.forEach((id) => grants.add(id));
      else grants.add(countryId);
    }
    for (const id of grants) {
      await prisma.consultantLocation.upsert({
        where: { consultantId_locationId: { consultantId, locationId: id } },
        update: {},
        create: { consultantId, locationId: id },
      });
      locationGrants += 1;
    }
  }

  console.log(
    `  Grants: ${industryGrants} industry, ${specializationGrants} specialization, ${locationGrants} location`,
  );

  console.log(`\n✅ Consultants seeded — ${users.length} users.`);
  rejects.print();

  await resyncDisplayIdSequences(prisma);
}

main()
  .catch((e) => {
    console.error('❌ User import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
