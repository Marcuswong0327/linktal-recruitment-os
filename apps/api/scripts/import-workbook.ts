/**
 * Imports the Linktal workbook's business data into the reworked schema.
 *
 * Replaces the old `import-excel.ts`, which was written against three separate
 * local files (`Icarus Candidate Database.xlsx` and friends) that no longer
 * exist. The source today is one Google-Sheet export with ten tabs; the shared
 * plumbing for reading it lives in `./workbook`.
 *
 * ## Import identity
 *
 * The workbook's own ID columns are empty and its cross-sheet links are written
 * as name + spreadsheet row number, so **row position is the identity**. Each
 * record's `displayId` is derived from its row (`Client-0439` is the client on
 * spreadsheet row 439) and every write is an upsert on it. That makes re-imports
 * idempotent and lets a later tab resolve "Hakka Pty Ltd - Row 439" to a real
 * record without guessing. Natural keys can't do this job: 744 candidate rows
 * share an email and 568 share a mobile.
 *
 * ## Rejects, not guesses
 *
 * Anything unresolvable is collected in a `RejectReport` and skipped. An unknown
 * city must never quietly mint a junk Location node — the tree is GeoNames-
 * loaded and admin-only — and an unresolvable industry must never invent a
 * category the scope resolver will then filter on.
 *
 * ## Usage
 *
 *   pnpm --filter @linktal/api import:workbook              # every tab, in order
 *   pnpm --filter @linktal/api import:workbook --only=clients
 *   pnpm --filter @linktal/api import:workbook --dry        # parse + report, no writes
 *   pnpm --filter @linktal/api import:workbook --refresh    # re-download the sheet first
 *
 * Prerequisites: `pnpm seed` (RBAC), then import:locations, import:industries,
 * import:taxonomy and import:users — this script resolves against all of them
 * and never creates them.
 */
import 'dotenv/config';
import { CandidateStatus, ClientStatus, JobOrderQuality, JobOrderStatus, PrismaClient, SubmissionStatus } from '@prisma/client';
import { RejectReport, norm, parseDate, parseRowLink, readSheet, splitList, splitName } from './workbook';
import { AliasTarget, resolveAlias } from './seed-data/location-aliases';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry');
const ONLY = (() => {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  return arg ? new Set(arg.slice('--only='.length).split(',').map((s) => s.trim())) : null;
})();

const wanted = (tab: string): boolean => ONLY === null || ONLY.has(tab);

// ---------------------------------------------------------------------------
// Column indices
// ---------------------------------------------------------------------------
// Positional, not header-lookup: several tabs have duplicate headers (the
// candidate contact tab repeats "Under Candidates  ID" five times) and blank
// ones, so names can't address a column reliably.

const STAKEHOLDER = {
  companyName: 1,
  coverage: 3,
  firstName: 4,
  roleType: 5,
  currentTitle: 6,
  linkedinUrl: 7,
  email: 8,
  needToVerify: 13,
} as const;

const CANDIDATE = {
  country: 1,
  industry: 2,
  city: 3,
  suburb: 4,
  roleType: 5,
  specialization: 6,
  firstName: 7,
  lastName: 8,
  fullName: 9,
  mobile: 10,
  email: 11,
  linkedinUrl: 12,
  seekTalentUrl: 13,
  latestCompany: 14,
  latestRole: 15,
  latestPeriod: 16,
  prevCompany: 17,
  prevRole: 18,
  prevPeriod: 19,
  status: 25,
} as const;

const CANDIDATE_CONTACT = {
  // The tab repeats the header "Under Candidates  ID" five times; decoded
  // positionally these are the candidate's identifying fields, not an id.
  // Column 1 is junk (0% filled with "1","2","3"…).
  firstName: 2,
  lastName: 3,
  email: 4,
  mobile: 5,
  contactedAt: 8,
  contactedBy: 9,
  category: 10,
  outreachCampaignNotes: 11,
  status: 14,
  suburb: 15,
  conversationSummary: 16,
  currentSalary: 17,
  expectedSalary: 18,
} as const;

const TOB = {
  fileName: 1,
  fileType: 2,
  companyName: 4,
  sourceFileLink: 5,
  clientTobRepresentative: 6,
  linktalRepresentative: 7,
  pricing: 8,
  guaranteePeriod: 9,
  paymentTerm: 10,
  invoiceContactName: 11,
  invoiceContactEmail: 12,
} as const;

const JOB_RESEARCH = {
  cityAdvertised: 0,
  suburbs: 1,
  jobTitle: 2,
  roleType: 3,
  clientLink: 4,
  status: 5,
  salary: 6,
  postedDate: 7,
  contactEmail: 8,
  seekUrl: 9,
  permanentUrl: 10,
} as const;

const JOB_ORDER = {
  consultant: 1,
  city: 2,
  clientCompany: 4,
  role: 5,
  openings: 6,
  quality: 7,
  status: 8,
  value: 9,
  briefingNotes: 11,
} as const;

const CLIENT = {
  name: 1,
  country: 2,
  industry: 3,
  specialization: 4,
  city: 5,
  website: 6,
  seekUrl: 7,
  linkedinUrl: 8,
  addresses: 9,
  suburbs: 10,
  description: 11,
  quality: 12,
  status: 13,
  lastContactDate: 14,
  lastContactBy: 15,
} as const;

// ---------------------------------------------------------------------------
// Value mapping
// ---------------------------------------------------------------------------

/**
 * The sheet joins this industry's two words with a semicolon
 * ("Banking; Financial Services") where the taxonomy has one name. Listed
 * explicitly rather than stripping punctuation generally, so an genuinely
 * unknown industry still rejects instead of being mangled into a near-match.
 */
const INDUSTRY_ALIASES: Record<string, string> = {
  'banking; financial services': 'Banking Financial Services',
};

/**
 * Client relationship status. 97% of rows are blank and fall through to the
 * column default (COLD) rather than being rejected — an untracked relationship
 * is genuinely cold, not missing data. `quality` is deliberately not mapped at
 * all: every one of the 1,645 rows is blank, so the column default stands.
 */
function clientStatus(raw: string | null): ClientStatus | undefined {
  if (!raw) return undefined;
  const key = raw.toLowerCase().trim();
  if (key === 'cold') return ClientStatus.COLD;
  if (key === 'warm') return ClientStatus.WARM;
  if (key === 'traded') return ClientStatus.TRADED;
  return undefined;
}

/**
 * Consultant names as the sheet spells them, where that differs from the
 * `Consultant.fullName` created by `import-users.ts`. Without this the TOB tab's
 * 1 "Zhaohao Teoh" row silently loses its Linktal representative.
 */
const CONSULTANT_ALIASES: Record<string, string> = {
  'zhaohao teoh': 'Zhao Hao Teoh',
};

/**
 * Guarantee periods are written as prose ("6 Months") but stored as Int days,
 * so they stay computable. Months are treated as 30 days — the source is
 * approximate by nature, and `Placement.guaranteeEndDate` is entered manually
 * rather than derived from this (a client can hold several TOBs that disagree).
 */
function guaranteeDays(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(day|week|month|year)/i);
  if (!match) {
    const bare = Number(raw.trim());
    return Number.isFinite(bare) && bare > 0 ? Math.round(bare) : null;
  }
  const value = Number(match[1]);
  const perUnit = { day: 1, week: 7, month: 30, year: 365 }[match[2].toLowerCase() as 'day'];
  return Math.round(value * perUnit);
}

/** `Client-0439` for spreadsheet row 439 — see "Import identity" above. */
function displayIdFor(prefix: string, rowNumber: number): string {
  return `${prefix}-${String(rowNumber).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Reference-data resolvers
// ---------------------------------------------------------------------------
// Loaded once and held in memory: the alternative is ~12,000 round trips to
// Neon for data that fits comfortably in a Map.

type SpecializationRef = { id: string; industryId: string };

type Refs = {
  locationByKey: Map<string, string>;
  industryByName: Map<string, string>;
  /** Name -> every specialization carrying it; see `resolveSpecializationId`. */
  specializationsByName: Map<string, SpecializationRef[]>;
  consultantByName: Map<string, string>;
};

async function loadRefs(): Promise<Refs> {
  const [locations, industries, specializations, consultants] = await Promise.all([
    prisma.location.findMany({ select: { id: true, name: true, level: true } }),
    prisma.industry.findMany({ select: { id: true, name: true } }),
    prisma.specialization.findMany({ select: { id: true, name: true, industryId: true } }),
    prisma.consultant.findMany({ select: { id: true, fullName: true } }),
  ]);

  // Keyed by level+name: "Sydney" exists as both a CITY and (elsewhere) other
  // rungs, and the alias table always says which rung it means.
  const locationByKey = new Map<string, string>();
  for (const l of locations) locationByKey.set(`${l.level}:${l.name.toLowerCase()}`, l.id);

  // A *list* per name, not a single id: 9 names are carried by more than one
  // specialization. Two of those are genuine cross-industry homonyms — `Steel`
  // exists under both Manufacturing and Construction, `Insurance` under both
  // Construction and Banking Financial Services — so a name alone cannot
  // identify a row, and picking whichever loaded last can file a record under
  // the wrong industry's leaf. Since `specializationId` narrows the industry
  // arm of the scope resolver, that is a visibility bug, not a cosmetic one.
  const specializationsByName = new Map<string, SpecializationRef[]>();
  for (const s of specializations) {
    const key = s.name.toLowerCase();
    const list = specializationsByName.get(key) ?? [];
    list.push({ id: s.id, industryId: s.industryId });
    specializationsByName.set(key, list);
  }

  return {
    locationByKey,
    industryByName: new Map(industries.map((i) => [i.name.toLowerCase(), i.id])),
    specializationsByName,
    consultantByName: new Map(consultants.map((c) => [c.fullName.toLowerCase(), c.id])),
  };
}

/**
 * Resolves a specialization name against the record's own industry, which is
 * what disambiguates the homonyms described above.
 *
 * The remaining 7 collisions are a different problem and deliberately not
 * solved here: they're duplicate rows in the taxonomy itself — same name, same
 * industry, same parent — loaded twice by `import-taxonomy.ts`. Either id is
 * semantically correct, so this takes the first and stays deterministic;
 * merging them is a catalog cleanup, not an importer concern.
 */
function resolveSpecializationId(
  refs: Refs,
  rawName: string,
  industryId: string,
  onAmbiguous: (value: string, reason: string) => void,
): string | undefined {
  const matches = refs.specializationsByName.get(rawName.toLowerCase());
  if (!matches || matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0].id;

  const inIndustry = matches.filter((m) => m.industryId === industryId);
  if (inIndustry.length > 0) return inIndustry[0].id;

  // Carried by several industries, none of them this record's — taking one
  // would silently misfile it, so leave it unset and say so.
  onAmbiguous(rawName, `name exists in ${matches.length} industries, none matching this record — left unset`);
  return undefined;
}

/**
 * Resolves a raw location cell — possibly multi-valued ("Sydney NSW; Melbourne
 * VIC") and written in desk labels rather than place names — to Location ids.
 * Every part must be a known alias; an unknown one is reported and dropped
 * rather than guessed at.
 */
function resolveLocationIds(
  refs: Refs,
  raw: unknown,
  onReject: (value: string, reason: string) => void,
): string[] {
  const ids: string[] = [];
  for (const part of splitList(raw)) {
    const targets: AliasTarget[] | null = resolveAlias(part);
    if (!targets) {
      onReject(part, 'unknown location alias');
      continue;
    }
    for (const target of targets) {
      const id = refs.locationByKey.get(`${target.level}:${target.name.toLowerCase()}`);
      if (!id) {
        onReject(`${target.level}:${target.name}`, 'alias target missing from the Location tree');
        continue;
      }
      ids.push(id);
    }
  }
  return [...new Set(ids)];
}

/**
 * Company-name matching key. The stakeholder, TOB and client-contact tabs all
 * link to a client by **name**, not by row number — their ID columns are empty
 * — so this is the join. Lowercased, punctuation and legal suffixes stripped,
 * whitespace collapsed, because the same company is written "Hakka Pty Ltd",
 * "Hakka Pty. Ltd." and "Hakka" across tabs.
 *
 * Suffix stripping is deliberately limited to the unambiguous legal forms. Any
 * broader normalisation (dropping "Group", "Australia", "&") starts merging
 * genuinely different companies, which is far worse than a reject.
 */
function companyKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(pty|ltd|limited|inc|incorporated|llc|bhd|sdn|berhad)\b/g, ' ')
    .replace(/[^a-z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Companies the job-order and TOB tabs name differently from the client list,
 * mapped to the client's `displayId`.
 *
 * Hand-listed rather than fuzzy-matched, and that restraint is the point. Of the
 * ten unmatched names, six are plainly the same company written shorter
 * ("Cordina Chicken" for "Cordina Chicken Farms Pty Ltd", "Regal Mushroom" for
 * "Regal Mushrooms"), three genuinely aren't in the client list at all
 * ("Careline", "Pallion", "Bangkok Bank") — and one, **"Third Party Platform",
 * prefix-matches "Thirdi Group", which is a completely different company**. A
 * contains/prefix heuristic would score six right and one badly wrong, silently.
 * So each match is asserted here, and everything else still rejects.
 *
 * Keys are already `companyKey`-normalised.
 */
const COMPANY_ALIASES: Record<string, string> = {
  'cordina chicken': 'Client-0261', // "Cordina Chicken Farms Pty Ltd"
  'regal mushroom': 'Client-0827', // "Regal Mushrooms"
  'premier fresh': 'Client-0777', // "Premier Fresh Australia"
  'baker s maison': 'Client-0128', // "Bakers Maison Australia" (first of 3 duplicates)
  jbs: 'Client-0526', // "JBS Australia Pty Limited"
};

/**
 * Upsert-and-cache for the combobox catalogs (JobTitle, StakeholderRoleType,
 * JobRoleType). These start empty — the sheet is where their vocabulary comes
 * from, ~2,300 job titles alone — so the importer has to grow them.
 *
 * That doesn't contradict the API rule that no write endpoint grows a catalog
 * on the way past: that rule governs the request surface, where a typo would
 * silently mint a near-duplicate. The importer is the bootstrap path, and
 * nothing else can populate these.
 */
class CatalogCache {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly find: (name: string) => Promise<{ id: string } | null>,
    private readonly create: (name: string) => Promise<{ id: string }>,
  ) {}

  async idFor(rawName: string | null): Promise<string | null> {
    const name = norm(rawName);
    if (!name) return null;
    const key = name.toLowerCase();
    const hit = this.cache.get(key);
    if (hit) return hit;
    const row = (await this.find(name)) ?? (await this.create(name));
    this.cache.set(key, row.id);
    return row.id;
  }
}

// ---------------------------------------------------------------------------
// Tab: clients
// ---------------------------------------------------------------------------

async function importClients(refs: Refs, rejects: RejectReport): Promise<Map<number, string>> {
  const { rows } = await readSheet('clients');
  const idByRow = new Map<number, string>();
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('clients', row.rowNumber, field, value, reason);

    const companyName = norm(row.cells[CLIENT.name]);
    if (!companyName) {
      skipped += 1;
      continue; // blank spacer row, not a reject
    }

    // industryId is REQUIRED by the schema — the industry arm of the scope
    // resolver relies on it never being null — so an unresolvable industry
    // fails the whole row rather than importing a client nobody can see.
    const rawIndustry = norm(row.cells[CLIENT.industry]);
    const industryKey = rawIndustry ? (INDUSTRY_ALIASES[rawIndustry.toLowerCase()] ?? rawIndustry) : null;
    const industryId = industryKey ? refs.industryByName.get(industryKey.toLowerCase()) : undefined;
    if (!industryId) {
      reject('Industry', rawIndustry, 'unknown industry — row skipped (industryId is required)');
      skipped += 1;
      continue;
    }

    // A client must cover at least one Location node, or it falls out of every
    // consultant's patch (the invariant ClientsService enforces as
    // CLIENT_LOCATION_REQUIRED). Country and City are both consulted; "All
    // Malaysia" in the City column resolves to the same COUNTRY node the
    // Country column gives, and the dedupe absorbs it.
    const locationIds = [
      ...new Set([
        ...resolveLocationIds(refs, row.cells[CLIENT.country], (v, r) => reject('Country', v, r)),
        ...resolveLocationIds(refs, row.cells[CLIENT.city], (v, r) => reject('City', v, r)),
      ]),
    ];
    if (locationIds.length === 0) {
      reject('Country/City', `${norm(row.cells[CLIENT.country])} / ${norm(row.cells[CLIENT.city])}`,
        'no resolvable location — row skipped (a client must cover at least one)');
      skipped += 1;
      continue;
    }

    // Optional: an unknown specialization narrows nothing and is safe to drop,
    // unlike the industry above.
    const rawSpecialization = norm(row.cells[CLIENT.specialization]);
    let specializationId: string | undefined;
    if (rawSpecialization) {
      specializationId = resolveSpecializationId(refs, rawSpecialization, industryId, (v, r) =>
        reject('Specialization', v, r),
      );
      if (!specializationId && !refs.specializationsByName.has(rawSpecialization.toLowerCase())) {
        reject('Specialization', rawSpecialization, 'unknown specialization — left unset');
      }
    }

    const lastContactByName = norm(row.cells[CLIENT.lastContactBy]);
    const lastContactedById = lastContactByName
      ? refs.consultantByName.get(lastContactByName.toLowerCase())
      : undefined;
    if (lastContactByName && !lastContactedById) {
      reject('Last Contact By', lastContactByName, 'unknown consultant — left unset');
    }

    const addresses = splitList(row.cells[CLIENT.addresses]);
    const suburbs = splitList(row.cells[CLIENT.suburbs]);

    const scalars = {
      companyName,
      industryId,
      specializationId: specializationId ?? null,
      website: norm(row.cells[CLIENT.website]),
      seekJobMarketUrl: norm(row.cells[CLIENT.seekUrl]),
      linkedinJobMarketUrl: norm(row.cells[CLIENT.linkedinUrl]),
      generalDescription: norm(row.cells[CLIENT.description]),
      addresses: addresses.length > 0 ? addresses : undefined,
      suburbsAndPostcodes: suburbs.length > 0 ? suburbs : undefined,
      // `undefined` leaves the column default in place (COLD); see clientStatus.
      status: clientStatus(norm(row.cells[CLIENT.status])),
      lastContactedAt: parseDate(row.cells[CLIENT.lastContactDate]),
      lastContactedById: lastContactedById ?? null,
    };

    const displayId = displayIdFor('Client', row.rowNumber);
    if (DRY_RUN) {
      idByRow.set(row.rowNumber, displayId);
      created += 1;
      continue;
    }

    // Upsert on displayId so a re-run updates in place rather than duplicating.
    // Locations are replaced wholesale — the list is short and the sheet is the
    // source of truth for it.
    const client = await prisma.client.upsert({
      where: { displayId },
      create: {
        displayId,
        ...scalars,
        locations: { create: locationIds.map((locationId) => ({ locationId })) },
      },
      update: {
        ...scalars,
        locations: { deleteMany: {}, create: locationIds.map((locationId) => ({ locationId })) },
      },
      select: { id: true },
    });
    idByRow.set(row.rowNumber, client.id);
    created += 1;
  }

  console.log(`  clients: ${created} imported, ${skipped} skipped`);
  return idByRow;
}

// ---------------------------------------------------------------------------
// Tab: stakeholders
// ---------------------------------------------------------------------------

/**
 * Indexes every imported client by its matching key, resolving to the earliest
 * spreadsheet row when several clients share one.
 *
 * Those collisions are **not** different companies sharing a name — checked
 * against the imported data, all 34 are the same company entered more than once
 * in the clients tab, as case variants ("CMI Electrical" / "CMI electrical"),
 * legal-suffix variants ("Capral" / "Capral Limited") or outright duplicates
 * ("Bega Group" twice). Every group sits in one industry. So attaching a contact
 * to the first of them is correct, and rejecting instead would drop 257 real
 * stakeholders to guard against a problem that isn't there.
 *
 * The duplicate clients are reported so the sheet can be cleaned; they are a
 * data-quality finding, not an import failure.
 */
async function loadClientIndex(): Promise<{ byKey: Map<string, string>; duplicates: Map<string, string[]> }> {
  const clients = await prisma.client.findMany({
    select: { id: true, displayId: true, companyName: true },
    orderBy: { displayId: 'asc' }, // earliest sheet row wins — deterministic
  });
  const byKey = new Map<string, string>();
  const seen = new Map<string, string[]>();
  const byDisplayId = new Map<string, string>();
  for (const c of clients) {
    byDisplayId.set(c.displayId, c.id);
    const key = companyKey(c.companyName);
    if (!key) continue;
    const names = seen.get(key) ?? [];
    names.push(`${c.displayId} "${c.companyName}"`);
    seen.set(key, names);
    if (!byKey.has(key)) byKey.set(key, c.id);
  }
  // Asserted aliases win over the derived key, and are the only fuzziness
  // allowed anywhere in company matching.
  for (const [key, displayId] of Object.entries(COMPANY_ALIASES)) {
    const id = byDisplayId.get(displayId);
    if (id) byKey.set(key, id);
  }
  const duplicates = new Map([...seen.entries()].filter(([, v]) => v.length > 1));
  return { byKey, duplicates };
}

async function importStakeholders(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('stakeholders');
  const { byKey, duplicates } = await loadClientIndex();
  console.log(`  (client index: ${byKey.size} unique names, ${duplicates.size} duplicated in the sheet)`);
  // Reported once against the clients tab, not per contact — it's the client
  // list that needs cleaning, and the contacts attached fine.
  for (const [key, names] of duplicates) {
    rejects.add('clients', 0, 'Client Company Name', names.join(' | '),
      `${names.length} client rows are the same company ("${key}") — contacts attached to the first`);
  }

  const jobTitles = new CatalogCache(
    (name) => prisma.jobTitle.findUnique({ where: { name }, select: { id: true } }),
    (name) => prisma.jobTitle.create({ data: { name }, select: { id: true } }),
  );
  const roleTypes = new CatalogCache(
    (name) => prisma.stakeholderRoleType.findUnique({ where: { name }, select: { id: true } }),
    (name) => prisma.stakeholderRoleType.create({ data: { name }, select: { id: true } }),
  );

  let imported = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('stakeholders', row.rowNumber, field, value, reason);

    const firstName = norm(row.cells[STAKEHOLDER.firstName]);
    const rawCompany = norm(row.cells[STAKEHOLDER.companyName]);
    if (!firstName && !rawCompany) {
      skipped += 1;
      continue; // blank spacer row
    }

    // clientId is non-null on Stakeholder, so an unmatched company fails the
    // row. This tab's own ID column is empty (0% filled, and what's there is
    // junk), so the name is the only join available.
    if (!rawCompany) {
      reject('Under Company Name', firstName, 'no company — row skipped');
      skipped += 1;
      continue;
    }
    const key = companyKey(rawCompany);
    const clientId = byKey.get(key);
    if (!clientId) {
      reject('Under Company Name', rawCompany, 'no client with this name — row skipped');
      unmatched += 1;
      continue;
    }

    const coverageIds = resolveLocationIds(refs, row.cells[STAKEHOLDER.coverage], (v, r) =>
      reject('Locations Coverage', v, r),
    );

    // The tab carries only a First Name column — there is no surname field —
    // so lastName stays null rather than being split out of a single token.
    const [jobTitleId, stakeholderRoleTypeId] = await Promise.all([
      jobTitles.idFor(norm(row.cells[STAKEHOLDER.currentTitle])),
      roleTypes.idFor(norm(row.cells[STAKEHOLDER.roleType])),
    ]);

    // "Need to Verify" holds the reason a contact is doubted ("Resigned",
    // "Wrong email"), which is exactly `inaccurateReason`. Its presence is what
    // makes isAccurate false; absence stays null — "not yet checked" is not the
    // same as "verified correct", and the Accurate column is 0% filled.
    const inaccurateReason = norm(row.cells[STAKEHOLDER.needToVerify]);

    const scalars = {
      clientId,
      firstName,
      jobTitleId,
      stakeholderRoleTypeId,
      linkedinUrl: norm(row.cells[STAKEHOLDER.linkedinUrl]),
      email: norm(row.cells[STAKEHOLDER.email]),
      isAccurate: inaccurateReason ? false : null,
      inaccurateReason,
    };

    const displayId = displayIdFor('Stake', row.rowNumber);
    if (!DRY_RUN) {
      await prisma.stakeholder.upsert({
        where: { displayId },
        create: {
          displayId,
          ...scalars,
          coverage: { create: coverageIds.map((locationId) => ({ locationId })) },
        },
        update: {
          ...scalars,
          coverage: { deleteMany: {}, create: coverageIds.map((locationId) => ({ locationId })) },
        },
        select: { id: true },
      });
    }
    imported += 1;
  }

  console.log(`  stakeholders: ${imported} imported, ${unmatched} unmatched company, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Tab: candidates
// ---------------------------------------------------------------------------

/**
 * Candidate status. The sheet writes both `Warm` (915 rows) and `warm` (623),
 * so the match is case-insensitive — a case-sensitive one would silently drop
 * 623 candidates to COLD. 22% of rows are blank and take the column default.
 */
function candidateStatus(raw: string | null): CandidateStatus | undefined {
  if (!raw) return undefined;
  switch (raw.toLowerCase().trim()) {
    case 'cold':
      return CandidateStatus.COLD;
    case 'warm':
      return CandidateStatus.WARM;
    case 'placed':
      return CandidateStatus.PLACED;
    case 'uns':
      return CandidateStatus.UNS;
    default:
      return undefined;
  }
}

/**
 * `Candidate.locationId` is a single required FK, but the sheet gives Country
 * (100% filled) and City (78%) in separate columns. Takes the most specific
 * node available: the city where there is one, the country otherwise — which is
 * what the 889 Malaysian rows, none of which carry a city, fall back to.
 */
function mostSpecificLocation(
  refs: Refs,
  countryCell: unknown,
  cityCell: unknown,
  onReject: (value: string, reason: string) => void,
): string | null {
  const cityIds = resolveLocationIds(refs, cityCell, onReject);
  if (cityIds.length > 0) return cityIds[0];
  const countryIds = resolveLocationIds(refs, countryCell, onReject);
  return countryIds[0] ?? null;
}

/**
 * The work timeline. The sheet spreads it across "Lastest Company/Role/Period"
 * and "Previous Company/Role/Period 1" columns (the Previous 2 set is 0%
 * filled). `period` stays free text — the source never stores parseable dates
 * ("2021-2023 (2 years)", "1/2/2023-1/8/2023 (6 days)").
 *
 * The latest role is included here as well as in `currentCompany`/`currentRole`:
 * those two columns have nowhere to put its period, and a timeline missing its
 * most recent entry reads as wrong.
 */
function workHistoryOf(cells: (string | number | null)[]): { company: string | null; role: string | null; period: string | null }[] {
  const entries = [
    { company: norm(cells[CANDIDATE.latestCompany]), role: norm(cells[CANDIDATE.latestRole]), period: norm(cells[CANDIDATE.latestPeriod]) },
    { company: norm(cells[CANDIDATE.prevCompany]), role: norm(cells[CANDIDATE.prevRole]), period: norm(cells[CANDIDATE.prevPeriod]) },
  ];
  return entries.filter((e) => e.company || e.role);
}

async function importCandidates(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('candidates');
  const roleTypes = new CatalogCache(
    (name) => prisma.jobRoleType.findUnique({ where: { name }, select: { id: true } }),
    (name) => prisma.jobRoleType.create({ data: { name }, select: { id: true } }),
  );

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('candidates', row.rowNumber, field, value, reason);

    const { firstName, lastName } = splitName(
      row.cells[CANDIDATE.firstName],
      row.cells[CANDIDATE.lastName],
      row.cells[CANDIDATE.fullName],
    );
    const email = norm(row.cells[CANDIDATE.email]);
    const mobile = norm(row.cells[CANDIDATE.mobile]);
    if (!firstName && !lastName && !email && !mobile) {
      skipped += 1;
      continue; // blank spacer row
    }

    // industryId and locationId are both REQUIRED — they're the two tiers the
    // scope resolver can't work without — so either failing fails the row
    // rather than importing someone nobody can see.
    const rawIndustry = norm(row.cells[CANDIDATE.industry]);
    const industryKey = rawIndustry ? (INDUSTRY_ALIASES[rawIndustry.toLowerCase()] ?? rawIndustry) : null;
    const industryId = industryKey ? refs.industryByName.get(industryKey.toLowerCase()) : undefined;
    if (!industryId) {
      reject('Industry', rawIndustry, 'unknown industry — row skipped (industryId is required)');
      skipped += 1;
      continue;
    }

    const locationId = mostSpecificLocation(refs, row.cells[CANDIDATE.country], row.cells[CANDIDATE.city], (v, r) =>
      reject('Country/City', v, r),
    );
    if (!locationId) {
      reject('Country/City', `${norm(row.cells[CANDIDATE.country])} / ${norm(row.cells[CANDIDATE.city])}`,
        'no resolvable location — row skipped (locationId is required)');
      skipped += 1;
      continue;
    }

    // Optional. The column is only 28% filled and carries some non-taxonomy
    // text ("UNS - Moved to other state" is a status, not a specialization),
    // so an unknown value is reported and left off rather than invented.
    const rawSpecialization = norm(row.cells[CANDIDATE.specialization]);
    let specializationId: string | undefined;
    if (rawSpecialization) {
      specializationId = resolveSpecializationId(refs, rawSpecialization, industryId, (v, r) =>
        reject('Specialization', v, r),
      );
      if (!specializationId && !refs.specializationsByName.has(rawSpecialization.toLowerCase())) {
        reject('Specialization', rawSpecialization, 'unknown specialization — left unset');
      }
    }

    // The sheet's "Suburb & Postcode" has no home on Candidate (no free-text
    // suburb field); it survives on CandidateContactHistory.suburb, which the
    // contact-history tab carries separately.
    const history = workHistoryOf(row.cells);

    const scalars = {
      firstName,
      lastName,
      email,
      mobile,
      industryId,
      locationId,
      jobRoleTypeId: await roleTypes.idFor(norm(row.cells[CANDIDATE.roleType])),
      currentCompany: norm(row.cells[CANDIDATE.latestCompany]),
      currentRole: norm(row.cells[CANDIDATE.latestRole]),
      linkedinUrl: norm(row.cells[CANDIDATE.linkedinUrl]),
      seekTalentUrl: norm(row.cells[CANDIDATE.seekTalentUrl]),
      workHistory: history.length > 0 ? history : undefined,
      status: candidateStatus(norm(row.cells[CANDIDATE.status])),
    };

    const displayId = displayIdFor('CDD', row.rowNumber);
    if (!DRY_RUN) {
      await prisma.candidate.upsert({
        where: { displayId },
        create: {
          displayId,
          ...scalars,
          ...(specializationId ? { specializations: { create: [{ specializationId }] } } : {}),
        },
        update: {
          ...scalars,
          ...(specializationId
            ? { specializations: { deleteMany: {}, create: [{ specializationId }] } }
            : { specializations: { deleteMany: {} } }),
        },
        select: { id: true },
      });
    }
    imported += 1;
  }

  console.log(`  candidates: ${imported} imported, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Tab: candidateContacts
// ---------------------------------------------------------------------------

/** Mobile numbers are written every possible way — "0 460 658 882",
 *  "+61 0460658882", "460658882" — so they're compared as bare digits with the
 *  country code and trunk zero stripped. */
function mobileKey(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^61/, '').replace(/^0/, '');
}

function personName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').toLowerCase().trim();
}

type CandidateRef = { id: string; displayId: string; name: string };

/**
 * Resolves a contact-history row to a candidate.
 *
 * This tab carries **no candidate id** — its five identically-headed "Under
 * Candidates  ID" columns are really first name, last name, email and mobile —
 * so the match is on those, tried strongest-first: email, then mobile, then
 * name. Measured against the imported candidates: 1,620 rows resolve on email
 * alone, 134 more on mobile, 98 on name, and none fail outright.
 *
 * The interesting case is a key held by several candidates (344 emails are
 * shared, per CLAUDE.md). Checked against the data, **306 of those 344 groups
 * are one person entered twice** — same name, usually the same mobile, e.g.
 * `CDD-0002` and `CDD-0816` are both "Zeng Jun Pang". So when every candidate
 * behind a key carries the same name it's a duplicate record, and the contact
 * attaches to the earliest row. When the names differ (38 groups — a shared
 * household email, or a typo) they're genuinely different people and no
 * attribution is safe, so the row is rejected.
 */
function resolveCandidate(
  indexes: { byEmail: Map<string, CandidateRef[]>; byMobile: Map<string, CandidateRef[]>; byName: Map<string, CandidateRef[]> },
  cells: { email: string | null; mobile: string | null; name: string },
): { ref: CandidateRef } | { ambiguous: CandidateRef[] } | null {
  const attempts = [
    cells.email ? indexes.byEmail.get(cells.email.toLowerCase().trim()) : undefined,
    cells.mobile ? indexes.byMobile.get(mobileKey(cells.mobile)) : undefined,
    cells.name ? indexes.byName.get(cells.name) : undefined,
  ];

  let ambiguous: CandidateRef[] | null = null;
  for (const matches of attempts) {
    if (!matches || matches.length === 0) continue;
    if (matches.length === 1) return { ref: matches[0] };
    // Several candidates behind this key — one person entered twice, or several
    // people sharing it. Only the former is safe to collapse.
    if (new Set(matches.map((m) => m.name)).size === 1) {
      return { ref: matches[0] }; // sorted by displayId, so this is the earliest
    }
    ambiguous ??= matches;
  }
  return ambiguous ? { ambiguous } : null;
}

async function importCandidateContacts(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('candidateContacts');

  const candidates = await prisma.candidate.findMany({
    select: { id: true, displayId: true, firstName: true, lastName: true, email: true, mobile: true },
    orderBy: { displayId: 'asc' }, // earliest sheet row wins on a duplicate
  });
  const index = (keyOf: (c: (typeof candidates)[0]) => string | null) => {
    const map = new Map<string, CandidateRef[]>();
    for (const c of candidates) {
      const key = keyOf(c);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push({ id: c.id, displayId: c.displayId, name: personName(c.firstName, c.lastName) });
      map.set(key, list);
    }
    return map;
  };
  const indexes = {
    byEmail: index((c) => (c.email ? c.email.toLowerCase().trim() : null)),
    byMobile: index((c) => (c.mobile ? mobileKey(c.mobile) : null)),
    byName: index((c) => personName(c.firstName, c.lastName) || null),
  };

  let imported = 0;
  let ambiguous = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('candidateContacts', row.rowNumber, field, value, reason);

    const firstName = norm(row.cells[CANDIDATE_CONTACT.firstName]);
    const lastName = norm(row.cells[CANDIDATE_CONTACT.lastName]);
    const email = norm(row.cells[CANDIDATE_CONTACT.email]);
    const mobile = norm(row.cells[CANDIDATE_CONTACT.mobile]);
    if (!firstName && !lastName && !email && !mobile) {
      skipped += 1;
      continue;
    }

    const match = resolveCandidate(indexes, { email, mobile, name: personName(firstName, lastName) });
    if (!match) {
      reject('candidate', `${firstName ?? ''} ${lastName ?? ''} ${email ?? ''}`.trim(), 'no candidate matches — row skipped');
      unmatched += 1;
      continue;
    }
    if ('ambiguous' in match) {
      reject('candidate', `${email ?? mobile ?? ''}`,
        `shared by ${match.ambiguous.length} different people (${match.ambiguous.map((m) => m.displayId).join(', ')}) — row skipped`);
      ambiguous += 1;
      continue;
    }

    const contactByName = norm(row.cells[CANDIDATE_CONTACT.contactedBy]);
    const contactedById = contactByName ? refs.consultantByName.get(contactByName.toLowerCase()) : undefined;
    if (contactByName && !contactedById) {
      reject('Contacted By', contactByName, 'unknown consultant — left unset');
    }

    const contactedAt = parseDate(row.cells[CANDIDATE_CONTACT.contactedAt]);
    if (!contactedAt && norm(row.cells[CANDIDATE_CONTACT.contactedAt])) {
      reject('Contacted date', row.cells[CANDIDATE_CONTACT.contactedAt], 'unparseable date — defaulted to now');
    }

    const scalars = {
      candidateId: match.ref.id,
      // The channel isn't recorded on this tab — only the category (screening
      // vs. outreach) — so contactType stays null rather than being inferred.
      category: norm(row.cells[CANDIDATE_CONTACT.category]),
      contactedById: contactedById ?? null,
      ...(contactedAt ? { contactedAt } : {}),
      outreachCampaignNotes: norm(row.cells[CANDIDATE_CONTACT.outreachCampaignNotes]),
      conversationSummary: norm(row.cells[CANDIDATE_CONTACT.conversationSummary]),
      status: candidateStatus(norm(row.cells[CANDIDATE_CONTACT.status])),
      // The suburb survives here as free text — the Location tree has no SUBURB
      // rung loaded, so there is nothing to resolve it against.
      suburb: norm(row.cells[CANDIDATE_CONTACT.suburb]),
      // Free text, deliberately: the source writes "35 per hour", "more 53-55".
      currentSalary: norm(row.cells[CANDIDATE_CONTACT.currentSalary]),
      expectedSalary: norm(row.cells[CANDIDATE_CONTACT.expectedSalary]),
    };

    const displayId = displayIdFor('CDN', row.rowNumber);
    if (!DRY_RUN) {
      await prisma.candidateContactHistory.upsert({
        where: { displayId },
        create: { displayId, ...scalars },
        update: scalars,
        select: { id: true },
      });
    }
    imported += 1;
  }

  console.log(
    `  candidateContacts: ${imported} imported, ${ambiguous} ambiguous, ${unmatched} unmatched, ${skipped} skipped`,
  );
}

// ---------------------------------------------------------------------------
// Tabs: tobs, jobResearch
// ---------------------------------------------------------------------------

/** Resolves a consultant by the name the sheet uses, via CONSULTANT_ALIASES. */
function consultantId(refs: Refs, rawName: string | null): string | undefined {
  if (!rawName) return undefined;
  const key = rawName.toLowerCase().trim();
  return refs.consultantByName.get(CONSULTANT_ALIASES[key]?.toLowerCase() ?? key);
}

async function importTobs(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('tobs');
  const { byKey } = await loadClientIndex();
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('tobs', row.rowNumber, field, value, reason);

    const rawCompany = norm(row.cells[TOB.companyName]);
    const fileName = norm(row.cells[TOB.fileName]);
    if (!rawCompany && !fileName) {
      skipped += 1;
      continue;
    }
    // clientId is non-null on Tob; the tab's own ID column is 0% filled, so the
    // company name is the only join.
    const clientId = rawCompany ? byKey.get(companyKey(rawCompany)) : undefined;
    if (!clientId) {
      reject('Under Company Name', rawCompany, 'no client with this name — row skipped');
      skipped += 1;
      continue;
    }

    const repName = norm(row.cells[TOB.linktalRepresentative]);
    const linktalRepresentativeId = consultantId(refs, repName);
    if (repName && !linktalRepresentativeId) {
      reject('Linktal Representative User', repName, 'unknown consultant — left unset');
    }

    const rawGuarantee = norm(row.cells[TOB.guaranteePeriod]);
    const guaranteePeriod = guaranteeDays(rawGuarantee);
    if (rawGuarantee && guaranteePeriod === null) {
      reject('Guarantee Period', rawGuarantee, 'unparseable guarantee period — left unset');
    }

    const scalars = {
      clientId,
      fileName,
      fileType: norm(row.cells[TOB.fileType]),
      sourceFileLink: norm(row.cells[TOB.sourceFileLink]),
      clientTobRepresentative: norm(row.cells[TOB.clientTobRepresentative]),
      linktalRepresentativeId: linktalRepresentativeId ?? null,
      // Free text on purpose — the column mixes "0.18" with
      // "13%-(80k below)15%-18%", and only the latter survives as a number.
      pricing: norm(row.cells[TOB.pricing]),
      guaranteePeriod,
      paymentTerm: norm(row.cells[TOB.paymentTerm]),
      invoiceContactName: norm(row.cells[TOB.invoiceContactName]),
      invoiceContactEmail: norm(row.cells[TOB.invoiceContactEmail]),
    };

    const displayId = displayIdFor('TOB', row.rowNumber);
    if (!DRY_RUN) {
      await prisma.tob.upsert({ where: { displayId }, create: { displayId, ...scalars }, update: scalars, select: { id: true } });
    }
    imported += 1;
  }

  console.log(`  tobs: ${imported} imported, ${skipped} skipped`);
}

/**
 * Indexes clients by `displayId`, which is how the row-linked tabs address them:
 * "Hakka Pty Ltd - Row 439" resolves through `Client-0439`. This is the identity
 * scheme working as designed — no name matching needed.
 */
async function loadClientByDisplayId(): Promise<Map<string, string>> {
  const clients = await prisma.client.findMany({ select: { id: true, displayId: true } });
  return new Map(clients.map((c) => [c.displayId, c.id]));
}

async function importJobResearch(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('jobResearch');
  const byDisplayId = await loadClientByDisplayId();
  const jobTitles = new CatalogCache(
    (name) => prisma.jobTitle.findUnique({ where: { name }, select: { id: true } }),
    (name) => prisma.jobTitle.create({ data: { name }, select: { id: true } }),
  );
  const roleTypes = new CatalogCache(
    (name) => prisma.jobRoleType.findUnique({ where: { name }, select: { id: true } }),
    (name) => prisma.jobRoleType.create({ data: { name }, select: { id: true } }),
  );

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('jobResearch', row.rowNumber, field, value, reason);

    const rawLink = norm(row.cells[JOB_RESEARCH.clientLink]);
    if (!rawLink) {
      skipped += 1;
      continue;
    }
    // 100% of this column is row-linked, so parse the row number rather than
    // falling back to the name.
    const link = parseRowLink(rawLink);
    const clientId = link.rowNumber ? byDisplayId.get(displayIdFor('Client', link.rowNumber)) : undefined;
    if (!clientId) {
      reject('Client(Company) ID', rawLink, 'row link does not resolve to a client — row skipped');
      skipped += 1;
      continue;
    }

    // The "Suburbs" column has nowhere to land — ClientJobResearch carries a
    // single locationId and no free-text suburb — so the ad is placed at its
    // advertised CITY and the suburb is reported as dropped.
    const suburb = norm(row.cells[JOB_RESEARCH.suburbs]);
    if (suburb) {
      reject('Suburbs', suburb, 'no suburb field on ClientJobResearch — dropped, location set to the advertised city');
    }
    const locationIds = resolveLocationIds(refs, row.cells[JOB_RESEARCH.cityAdvertised], (v, r) =>
      reject('City Advertised', v, r),
    );

    const scalars = {
      clientId,
      locationId: locationIds[0] ?? null,
      jobTitleId: await jobTitles.idFor(norm(row.cells[JOB_RESEARCH.jobTitle])),
      jobRoleTypeId: await roleTypes.idFor(norm(row.cells[JOB_RESEARCH.roleType])),
      // A snapshot of how the client stood when the ad was logged, not a live
      // reference to Client.status.
      status: clientStatus(norm(row.cells[JOB_RESEARCH.status])),
      seekUrl: norm(row.cells[JOB_RESEARCH.seekUrl]),
      permanentUrl: norm(row.cells[JOB_RESEARCH.permanentUrl]),
      postedDate: parseDate(row.cells[JOB_RESEARCH.postedDate]),
      contactEmailFromAd: norm(row.cells[JOB_RESEARCH.contactEmail]),
      salaryRange: norm(row.cells[JOB_RESEARCH.salary]),
    };

    const displayId = displayIdFor('JR', row.rowNumber);
    if (!DRY_RUN) {
      await prisma.clientJobResearch.upsert({
        where: { displayId },
        create: { displayId, ...scalars },
        update: scalars,
        select: { id: true },
      });
    }
    imported += 1;
  }

  console.log(`  jobResearch: ${imported} imported, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Tab: jobOrders
// ---------------------------------------------------------------------------

/**
 * Job order status. `Hold` is the sheet's spelling of ON_HOLD.
 *
 * One row says `Warm`, which is a *client relationship* status that has leaked
 * into this column — it isn't a JobOrderStatus at all. Rather than guess which
 * of ACTIVE/ON_HOLD was meant, the value is reported and the row takes the
 * column default (ACTIVE).
 */
function jobOrderStatus(raw: string | null): JobOrderStatus | undefined {
  if (!raw) return undefined;
  switch (raw.toLowerCase().trim()) {
    case 'active':
      return JobOrderStatus.ACTIVE;
    case 'placed':
      return JobOrderStatus.PLACED;
    case 'closed':
      return JobOrderStatus.CLOSED;
    case 'hold':
    case 'on hold':
      return JobOrderStatus.ON_HOLD;
    default:
      return undefined;
  }
}

/** The sheet abbreviates quality to a single letter. */
function jobOrderQuality(raw: string | null): JobOrderQuality | undefined {
  if (!raw) return undefined;
  switch (raw.toUpperCase().trim()) {
    case 'H':
      return JobOrderQuality.HIGH;
    case 'M':
      return JobOrderQuality.MEDIUM;
    case 'L':
      return JobOrderQuality.LOW;
    default:
      return undefined;
  }
}

async function importJobOrders(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('jobOrders');
  const { byKey } = await loadClientIndex();
  const jobTitles = new CatalogCache(
    (name) => prisma.jobTitle.findUnique({ where: { name }, select: { id: true } }),
    (name) => prisma.jobTitle.create({ data: { name }, select: { id: true } }),
  );
  const roleTypes = new CatalogCache(
    (name) => prisma.jobRoleType.findUnique({ where: { name }, select: { id: true } }),
    (name) => prisma.jobRoleType.create({ data: { name }, select: { id: true } }),
  );

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('jobOrders', row.rowNumber, field, value, reason);

    // This tab carries annotation rows mixed in with the data — Consultant
    // "Joe's questions", City "since consultant can only see …" — the same
    // pattern the User List tab has. A row with no company is one of those.
    const rawCompany = norm(row.cells[JOB_ORDER.clientCompany]);
    if (!rawCompany) {
      skipped += 1;
      continue;
    }
    const clientId = byKey.get(companyKey(rawCompany));
    if (!clientId) {
      reject('Client Company', rawCompany, 'no client with this name — row skipped');
      skipped += 1;
      continue;
    }

    const consultantName = norm(row.cells[JOB_ORDER.consultant]);
    const ownerId = consultantId(refs, consultantName);
    if (consultantName && !ownerId) {
      reject('Consultant', consultantName, 'unknown consultant — left unassigned');
    }

    const rawStatus = norm(row.cells[JOB_ORDER.status]);
    const status = jobOrderStatus(rawStatus);
    if (rawStatus && !status) {
      reject('Job Status', rawStatus, 'not a JobOrderStatus — defaulted to ACTIVE');
    }

    const locationIds = resolveLocationIds(refs, row.cells[JOB_ORDER.city], (v, r) => reject('City', v, r));

    // The sheet has one "Role" column; the schema splits it into the client's
    // brief (jobTitle) and the consultant's classification (jobRoleType), so it
    // seeds both — there's no second vocabulary to draw them apart yet.
    const role = norm(row.cells[JOB_ORDER.role]);
    const openings = Number(norm(row.cells[JOB_ORDER.openings]));
    const value = Number(norm(row.cells[JOB_ORDER.value]));

    const scalars = {
      clientId,
      consultantId: ownerId ?? null,
      jobTitleId: await jobTitles.idFor(role),
      jobRoleTypeId: await roleTypes.idFor(role),
      locationId: locationIds[0] ?? null,
      openings: Number.isFinite(openings) && openings > 0 ? Math.round(openings) : undefined,
      estimatedValue: Number.isFinite(value) && value > 0 ? value : null,
      notes: norm(row.cells[JOB_ORDER.briefingNotes]),
      status,
      quality: jobOrderQuality(norm(row.cells[JOB_ORDER.quality])),
    };

    const displayId = displayIdFor('JO', row.rowNumber);
    if (!DRY_RUN) {
      await prisma.jobOrder.upsert({
        where: { displayId },
        create: { displayId, ...scalars },
        update: scalars,
        select: { id: true },
      });
    }
    imported += 1;
  }

  console.log(`  jobOrders: ${imported} imported, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Tabs: clientContacts, interactions
// ---------------------------------------------------------------------------

/**
 * Client-side contact history. Only 4 rows exist. They land on
 * `StakeholderContactHistory`, not on Client — there is no client note timeline
 * by design (see CLAUDE.md).
 *
 * The tab's "Under Client Stakeholder ID" column holds a mix of contact names
 * ("Min Xie") and bare numbers ("1536"), neither of which is a stakeholder id,
 * so the contact is matched by **first name within the named company** — the
 * stakeholder tab only stores first names anyway.
 */
async function importClientContacts(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('clientContacts');
  const { byKey } = await loadClientIndex();
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('clientContacts', row.rowNumber, field, value, reason);

    const rawCompany = norm(row.cells[1]);
    const rawContact = norm(row.cells[2]);
    if (!rawCompany) {
      skipped += 1;
      continue;
    }
    const clientId = byKey.get(companyKey(rawCompany));
    if (!clientId) {
      reject('Under Client Company ID', rawCompany, 'no client with this name — row skipped');
      skipped += 1;
      continue;
    }

    // First name within the company. Falls back to the company's first contact
    // when the cell is a number rather than a name — the note belongs to that
    // company either way, and dropping it would lose the only client-side note.
    const contacts = await prisma.stakeholder.findMany({
      where: { clientId },
      select: { id: true, firstName: true },
      orderBy: { displayId: 'asc' },
    });
    if (contacts.length === 0) {
      reject('Under Client Stakeholder ID', rawContact, 'client has no stakeholders to attach the note to — row skipped');
      skipped += 1;
      continue;
    }
    const named = rawContact
      ? contacts.find((c) => c.firstName && rawContact.toLowerCase().includes(c.firstName.toLowerCase()))
      : undefined;
    if (rawContact && !named) {
      reject('Under Client Stakeholder ID', rawContact, 'not a stakeholder name — attached to the client’s first contact');
    }
    const stakeholderId = (named ?? contacts[0]).id;

    const contactByName = norm(row.cells[3]);
    const contactedById = consultantId(refs, contactByName);
    if (contactByName && !contactedById) {
      reject('Contacted by', contactByName, 'unknown consultant — left unset');
    }
    const contactedAt = parseDate(row.cells[4]);

    const scalars = {
      stakeholderId,
      category: norm(row.cells[5]),
      notes: norm(row.cells[6]),
      contactedById: contactedById ?? null,
      ...(contactedAt ? { contactedAt } : {}),
    };

    const displayId = displayIdFor('CN', row.rowNumber);
    if (!DRY_RUN) {
      await prisma.stakeholderContactHistory.upsert({
        where: { displayId },
        create: { displayId, ...scalars },
        update: scalars,
        select: { id: true },
      });
    }
    imported += 1;
  }

  console.log(`  clientContacts: ${imported} imported, ${skipped} skipped`);
}

/**
 * The pipeline. This tab is the **only** source for submissions in the whole
 * workbook — there is no placements tab — and it holds 4 rows: Submitted×2,
 * Interviewing×1, Placed×1.
 *
 * Both its link columns are 100% row-linked, so candidate and job order resolve
 * through `displayId` exactly. Each row is one action against a
 * (candidate, job order) pair, and `CandidateSubmission` is unique on that pair,
 * so the rows are folded into one submission per pair carrying the furthest
 * status reached.
 *
 * No `Placement` is created even for the Placed row: a placement needs a fee,
 * salary and start date, none of which this tab records, and inventing them
 * would put fabricated money in the reporting. The submission is marked PLACED
 * and the real placement is left to be entered by hand.
 */
async function importInteractions(refs: Refs, rejects: RejectReport): Promise<void> {
  const { rows } = await readSheet('interactions');
  const [candidates, jobOrders] = await Promise.all([
    prisma.candidate.findMany({ select: { id: true, displayId: true } }),
    prisma.jobOrder.findMany({ select: { id: true, displayId: true } }),
  ]);
  const candidateByDisplayId = new Map(candidates.map((c) => [c.displayId, c.id]));
  const jobOrderByDisplayId = new Map(jobOrders.map((j) => [j.displayId, j.id]));

  // Declaration order is progression order, so a later action always wins.
  const RANK: Record<string, SubmissionStatus> = {
    submitted: SubmissionStatus.SUBMITTED,
    interviewing: SubmissionStatus.INTERVIEWING,
    rejected: SubmissionStatus.REJECTED,
    placed: SubmissionStatus.PLACED,
  };
  const progression = [SubmissionStatus.SUBMITTED, SubmissionStatus.INTERVIEWING, SubmissionStatus.REJECTED, SubmissionStatus.PLACED];

  const merged = new Map<string, { candidateId: string; jobOrderId: string; status: SubmissionStatus; at: Date | null }>();

  for (const row of rows) {
    const reject = (field: string, value: unknown, reason: string) =>
      rejects.add('interactions', row.rowNumber, field, value, reason);

    const candLink = parseRowLink(norm(row.cells[3]));
    const joLink = parseRowLink(norm(row.cells[4]));
    const candidateId = candLink.rowNumber ? candidateByDisplayId.get(displayIdFor('CDD', candLink.rowNumber)) : undefined;
    const jobOrderId = joLink.rowNumber ? jobOrderByDisplayId.get(displayIdFor('JO', joLink.rowNumber)) : undefined;

    if (!candidateId || !jobOrderId) {
      reject('Candidate/JobOrder link', `${norm(row.cells[3])} → ${norm(row.cells[4])}`,
        !candidateId ? 'candidate row link does not resolve — row skipped' : 'job order row link does not resolve (its client may have been skipped) — row skipped');
      continue;
    }

    const action = norm(row.cells[7]);
    const status = action ? RANK[action.toLowerCase()] : undefined;
    if (!status) {
      reject('Actions records', action, 'unrecognised action — row skipped');
      continue;
    }

    const key = `${candidateId}:${jobOrderId}`;
    const existing = merged.get(key);
    const at = parseDate(row.cells[8]);
    if (!existing || progression.indexOf(status) > progression.indexOf(existing.status)) {
      merged.set(key, { candidateId, jobOrderId, status, at: at ?? existing?.at ?? null });
    }
  }

  let imported = 0;
  for (const entry of merged.values()) {
    if (!DRY_RUN) {
      await prisma.candidateSubmission.upsert({
        where: { candidateId_jobOrderId: { candidateId: entry.candidateId, jobOrderId: entry.jobOrderId } },
        create: {
          candidateId: entry.candidateId,
          jobOrderId: entry.jobOrderId,
          status: entry.status,
          ...(entry.at ? { submittedAt: entry.at } : {}),
        },
        update: { status: entry.status },
        select: { id: true },
      });
    }
    imported += 1;
  }

  console.log(`  interactions: ${imported} submissions from ${rows.length} action rows (no placements — see note)`);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`📥 Importing the Linktal workbook${DRY_RUN ? ' (dry run — no writes)' : ''}...\n`);

  const refs = await loadRefs();
  console.log(
    `  reference data: ${refs.locationByKey.size} locations, ${refs.industryByName.size} industries, ` +
      `${refs.specializationsByName.size} specialization names, ${refs.consultantByName.size} consultants\n`,
  );
  if (refs.consultantByName.size === 0) {
    throw new Error('No consultants found — run import:users before this script.');
  }

  const rejects = new RejectReport();

  // Dependency order: a tab never runs before the records it links into.
  if (wanted('clients')) {
    await importClients(refs, rejects);
  }
  if (wanted('stakeholders')) {
    await importStakeholders(refs, rejects);
  }
  if (wanted('candidates')) {
    await importCandidates(refs, rejects);
  }
  if (wanted('candidateContacts')) {
    await importCandidateContacts(refs, rejects);
  }
  if (wanted('tobs')) {
    await importTobs(refs, rejects);
  }
  if (wanted('jobResearch')) {
    await importJobResearch(refs, rejects);
  }
  if (wanted('jobOrders')) {
    await importJobOrders(refs, rejects);
  }
  if (wanted('clientContacts')) {
    await importClientContacts(refs, rejects);
  }
  if (wanted('interactions')) {
    await importInteractions(refs, rejects);
  }

  rejects.print();
  if (rejects.count > 0) rejects.writeTo('import-workbook-rejects.csv');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
