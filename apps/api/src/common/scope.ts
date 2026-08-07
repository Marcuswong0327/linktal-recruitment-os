import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';

/**
 * Row-level visibility scoping for the `consultant` role. Every other role
 * (admin/manager/finance/researcher/viewer) is unrestricted and never calls
 * these — see each service's `findAll`/`findOne` for the `roleName ===
 * 'consultant'` gate.
 *
 *     visible = (industry match AND specialization match) OR (location match)
 *
 * Two arms, OR-ed: a consultant reaches a record either because it's in their
 * industry or because it's in their patch.
 *
 * Each arm is a hierarchy, and **a grant covers the granted node plus every
 * descendant**. That's implemented with the denormalized `ancestorIds` column
 * on Location/Specialization (self + every ancestor), so the test is one
 * indexed `hasSome` against the consultant's grant list. The alternative —
 * expanding grants downward — is unworkable: a single COUNTRY:Australia grant
 * covers 1,502 nodes today and would grow with every suburb loaded.
 *
 * Null semantics differ by tier, deliberately:
 *  - `industryId` is REQUIRED on Client/Candidate, so the industry arm never
 *    has to decide what an untagged record means.
 *  - `specializationId` is optional, and an unspecialised record matches any
 *    grant on its industry. Without that passthrough, the ~72% of candidates
 *    carrying no specialization would vanish the moment the arm switches on.
 */

/** Matches a single-FK location: the node itself, or anything under a granted one. */
function locationIsUnder(locationIds: string[]) {
  return { location: { ancestorIds: { hasSome: locationIds } } };
}

/**
 * The industry arm, optionally narrowed by specialization.
 *
 * `viaClient` is where the industry lives relative to the record — Client and
 * Candidate own theirs; Stakeholder, JobOrder and ClientJobResearch reach it
 * through their parent Client.
 */
function industryArm(user: AuthUser, viaClient: boolean): Prisma.ClientWhereInput {
  const own: Prisma.ClientWhereInput = { industryId: { in: user.industryIds } };
  // Narrow by specialization only when the consultant actually holds any —
  // no grants means "the whole industry", not "nothing".
  if (user.specializationIds.length > 0) {
    own.OR = [
      // Unspecialised records pass through on their industry alone.
      { specializationId: null },
      { specialization: { ancestorIds: { hasSome: user.specializationIds } } },
    ];
  }
  return viaClient ? ({ client: own } as Prisma.ClientWhereInput) : own;
}

/**
 * The same arm for **Candidate**, which cannot reuse the one above.
 *
 * Client carries a single `specializationId` FK; a Candidate carries a *set*
 * (`CandidateSpecialization[]`) and has no such scalar column at all. Casting
 * the Client shape across — which is what this used to do — produced a `where`
 * Prisma rejects outright (`Unknown argument 'specializationId'`), so a
 * consultant holding any specialization grant got a 500 from `GET /candidates`
 * rather than a filtered list. Every consultant in the seed holds 2–4.
 *
 * `none: {}` is the join-table spelling of "unspecialised", matching the
 * `specializationId: null` passthrough above: a candidate with no tags at all
 * still qualifies on their industry.
 */
function candidateIndustryArm(user: AuthUser): Prisma.CandidateWhereInput {
  const own: Prisma.CandidateWhereInput = { industryId: { in: user.industryIds } };
  if (user.specializationIds.length > 0) {
    own.OR = [
      { specializations: { none: {} } },
      {
        specializations: {
          some: { specialization: { ancestorIds: { hasSome: user.specializationIds } } },
        },
      },
    ];
  }
  return own;
}

/** True when this caller is scoped at all. Everyone else sees everything. */
export function isScoped(user: AuthUser): boolean {
  return user.roleName === 'consultant';
}

/**
 * A consultant with no grants at all sees nothing — never everything. Zero
 * rows means "not configured yet", which is why wildcards are materialised
 * into concrete grant rows at assignment time rather than left implicit.
 */
function hasNoGrants(user: AuthUser): boolean {
  return user.industryIds.length === 0 && user.locationIds.length === 0;
}

// ---------------------------------------------------------------------------
// Per-entity `where` fragments
// ---------------------------------------------------------------------------
// Written out per entity rather than driven by a config object: the five
// shapes differ in *where* each arm lives (own column vs. via Client, single
// FK vs. join table), and spelling them out reads better than a mapping layer
// that has to encode the same five cases anyway.

/**
 * **The ownership arm, shared by every entity that carries a `consultantId`.**
 *
 * A record assigned to this consultant is always theirs to see, whatever their
 * grants say. An assignment is a deliberate admin act on one specific row, not
 * a wildcard, so honouring it doesn't reopen the "zero grants means everything"
 * hole the rest of this file is careful about — which is why each scope below
 * returns it *above* the `hasNoGrants` short-circuit rather than folding it
 * into the OR. Two failures it prevents: being handed an account and still
 * getting a 403 on it, and watching one vanish the moment its industry is
 * retagged.
 *
 * Stakeholder is the one entity with no ownership arm, because it has no
 * `consultantId`: contacts belong to a client, not to a recruiter — see
 * `stakeholderScope` below, which delegates to its client entirely.
 */
function ownedBy(user: AuthUser): { consultantId: string } {
  return { consultantId: user.consultantId };
}

export function clientScope(user: AuthUser): Prisma.ClientWhereInput {
  const owned = ownedBy(user);
  if (hasNoGrants(user)) return owned;
  return {
    OR: [owned, industryArm(user, false), { locations: { some: locationIsUnder(user.locationIds) } }],
  };
}

/**
 * A TOB carries no scope fields of its own — no industry, no location, no
 * `consultantId`. It's a commercial document belonging to a company, so it's
 * visible exactly when that company is, every one of `clientScope`'s arms
 * included. Delegating rather than restating them means this can't drift out
 * of sync later. Stakeholder delegates the same way, immediately below.
 *
 * Soft-deleted clients need no explicit exclusion: `ClientsService.remove`
 * soft-deletes a client's TOBs alongside it (via the cascade in
 * prisma.extensions.ts), so the extended client's top-level rewrite has
 * already dropped them before this relation filter is reached.
 */
export function tobScope(user: AuthUser): Prisma.TobWhereInput {
  return { client: clientScope(user) };
}

export function candidateScope(user: AuthUser): Prisma.CandidateWhereInput {
  const owned = ownedBy(user);
  if (hasNoGrants(user)) return owned;
  return { OR: [owned, candidateIndustryArm(user), locationIsUnder(user.locationIds)] };
}

export function jobOrderScope(user: AuthUser): Prisma.JobOrderWhereInput {
  const owned = ownedBy(user);
  if (hasNoGrants(user)) return owned;
  return {
    OR: [
      owned,
      industryArm(user, true) as Prisma.JobOrderWhereInput,
      locationIsUnder(user.locationIds),
    ],
  };
}

export function jobResearchScope(user: AuthUser): Prisma.ClientJobResearchWhereInput {
  const owned = ownedBy(user);
  if (hasNoGrants(user)) return owned;
  return {
    OR: [
      owned,
      industryArm(user, true) as Prisma.ClientJobResearchWhereInput,
      locationIsUnder(user.locationIds),
    ],
  };
}

/**
 * A stakeholder is visible exactly when its client is — no ownership arm of
 * its own (it has no `consultantId`; contacts belong to a client, not to a
 * recruiter), and no independent coverage check either. `coverage` is kept
 * purely as descriptive routing data (who to call about which patch), not a
 * scope gate.
 *
 * This used to be the one asymmetry: a stakeholder matched on its *own*
 * coverage, independent of its employer, so a Brisbane client's Sydney-
 * covering contact was reachable by a Sydney consultant even when the
 * Brisbane client itself wasn't. That's deliberately gone — once a client is
 * visible (by any arm), every one of its live contacts is too, full stop.
 */
export function stakeholderScope(user: AuthUser): Prisma.StakeholderWhereInput {
  return { client: clientScope(user) };
}

// ---------------------------------------------------------------------------
// Single-record access
// ---------------------------------------------------------------------------

/**
 * List endpoints filter silently; a direct `findOne`/`update`/`remove` on an
 * out-of-scope record gets an explicit 403 instead of a generic 404, so the
 * caller is told *why* rather than left guessing.
 *
 * Takes the already-resolved facts rather than re-querying: the caller has
 * just fetched the record, and its industry/location are on the row (or one
 * include away).
 */
export function assertInScope(
  user: AuthUser,
  record: { industryId?: string | null; locationAncestorIds?: string[]; consultantId?: string | null },
): void {
  if (!isScoped(user)) return;

  // Ownership wins outright — the single-record half of the `ownedBy` arm
  // above. Stakeholder is the one caller that omits it (no `consultantId`) and
  // falls straight through to the arms below.
  if (record.consultantId != null && record.consultantId === user.consultantId) return;

  const industryMatch =
    record.industryId != null && user.industryIds.includes(record.industryId);
  const locationMatch = (record.locationAncestorIds ?? []).some((id) =>
    user.locationIds.includes(id),
  );

  if (!industryMatch && !locationMatch) {
    throw new ForbiddenException({
      code: 'OUT_OF_JOB_SCOPE',
      message: 'This is not under your job scope.',
    });
  }
}

// ---------------------------------------------------------------------------
// Assignment guards
// ---------------------------------------------------------------------------

/**
 * **Assignment must agree with visibility.** A record can only be owned by a
 * consultant who would reach it anyway — same `industry OR location` test the
 * scopes above apply, so an assignment can never hand someone an account their
 * own list would then hide.
 *
 * It used to check industry *only*, which broke both ways. Too strict: a
 * consultant granted four cities and an industry holding zero clients
 * (Equipment, today) could be assigned nothing at all. Too loose: a Sydney
 * client could be handed to a Melbourne-only consultant, who then couldn't see
 * it, because location was never consulted.
 *
 * Stakeholder coverage — `clientScope`'s fourth arm — is deliberately not part
 * of this. A client has no contacts at the moment it's created, so a guard
 * that depended on them would be unenforceable on `create` and inconsistent
 * with `update`. Coverage still grants *visibility*; it just doesn't grant
 * *ownership*.
 */
type Grants = { industryIds: string[]; locationIds: string[] };

async function loadGrants(
  prisma: ExtendedPrismaClient,
  consultantId: string,
): Promise<Grants> {
  const [industries, locations] = await Promise.all([
    prisma.consultantIndustry.findMany({ where: { consultantId }, select: { industryId: true } }),
    prisma.consultantLocation.findMany({ where: { consultantId }, select: { locationId: true } }),
  ]);
  return {
    industryIds: industries.map((i) => i.industryId),
    locationIds: locations.map((l) => l.locationId),
  };
}

/**
 * What the guard needs to know about the record. `locationIds` are the
 * record's *own* nodes — one for Candidate/JobOrder, a set for Client — and
 * are matched against grants through `ancestorIds`, so a COUNTRY grant covers
 * a CITY-tagged record exactly as it does in the scopes above.
 */
export type OwnableRecord = { industryId: string | null; locationIds: string[] };

export async function consultantCovers(
  prisma: ExtendedPrismaClient,
  consultantId: string,
  record: OwnableRecord,
): Promise<boolean> {
  const grants = await loadGrants(prisma, consultantId);
  if (record.industryId != null && grants.industryIds.includes(record.industryId)) return true;
  if (record.locationIds.length === 0 || grants.locationIds.length === 0) return false;
  const covered = await prisma.location.count({
    where: { id: { in: record.locationIds }, ancestorIds: { hasSome: grants.locationIds } },
  });
  return covered > 0;
}

/** Admin/manager act as the org's dispatchers — see `assertConsultantCovers`. */
function canOverrideScopeMismatch(assignerRole: string | null | undefined): boolean {
  return assignerRole === 'admin' || assignerRole === 'manager';
}

/**
 * Call with a null/undefined `consultantId` (clearing an assignment) to skip —
 * there's nothing to validate when unassigning.
 *
 * `assignerRole` lets admin/manager override this deliberately: ownership is
 * the top-priority arm in every scope function above (see `ownedBy`), so a
 * consultant assigned outside their own grants still sees the record — the
 * guard exists to stop a *consultant* handing themselves or a peer something
 * that then vanishes from their own list by accident, not to stop admin/
 * manager making a deliberate exception. Omit `assignerRole` (or pass any
 * other role) to keep the guard active, which is what every consultant-
 * initiated assignment does.
 */
export async function assertConsultantCovers(
  prisma: ExtendedPrismaClient,
  consultantId: string | null | undefined,
  record: OwnableRecord,
  assignerRole?: string | null,
): Promise<void> {
  if (!consultantId) return;
  if (canOverrideScopeMismatch(assignerRole)) return;
  if (await consultantCovers(prisma, consultantId, record)) return;
  throw new BadRequestException({
    code: 'CONSULTANT_SCOPE_MISMATCH',
    message: "This consultant covers neither this record's industry nor its location.",
  });
}

/**
 * Same guard for a Job Order, which owns a location but reaches its industry
 * only through its Client — mirroring `jobOrderScope`, which matches on the
 * job order's own location and the client's industry.
 */
export async function assertConsultantCoversJobOrder(
  prisma: ExtendedPrismaClient,
  consultantId: string | null | undefined,
  clientId: string,
  locationId: string | null | undefined,
  assignerRole?: string | null,
): Promise<void> {
  if (!consultantId) return;
  if (canOverrideScopeMismatch(assignerRole)) return;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { industryId: true },
  });
  await assertConsultantCovers(prisma, consultantId, {
    industryId: client?.industryId ?? null,
    locationIds: locationId ? [locationId] : [],
  });
}

/**
 * Bidirectional auto-clear: a stale mismatched `consultantId` can never
 * persist. Two triggers, kept as separate named functions because "what
 * changed" has a different shape in each:
 *
 *  1. A Client/Candidate's own industry *or* locations changed.
 *  2. A consultant's own grants changed (`setIndustries` / `setLocations`).
 *
 * Both re-read the record's current state rather than taking the new values as
 * arguments. Locations are a to-many write, so the caller doesn't hold a
 * single "new location" to pass, and re-reading is the only way the check can't
 * disagree with what was actually persisted.
 */
export async function clearMismatchedClientAssignment(
  prisma: ExtendedPrismaClient,
  clientId: string,
): Promise<boolean> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { consultantId: true, industryId: true, locations: { select: { locationId: true } } },
  });
  if (!client) return false;
  const asRecord: OwnableRecord = {
    industryId: client.industryId,
    locationIds: client.locations.map((l) => l.locationId),
  };

  let clearedOwnConsultant = false;
  if (client.consultantId && !(await consultantCovers(prisma, client.consultantId, asRecord))) {
    await prisma.client.update({ where: { id: clientId }, data: { consultantId: null } });
    clearedOwnConsultant = true;
  }

  // Cascade: this Client's Job Orders inherit its industry, so any of their
  // own consultants that no longer reach them get cleared too. Each job order
  // carries its own location, so they're checked individually rather than
  // sharing the client's answer.
  const jobOrders = await prisma.jobOrder.findMany({
    where: { clientId, consultantId: { not: null } },
    select: { id: true, consultantId: true, locationId: true },
  });
  for (const jobOrder of jobOrders) {
    const covers = await consultantCovers(prisma, jobOrder.consultantId as string, {
      industryId: client.industryId,
      locationIds: jobOrder.locationId ? [jobOrder.locationId] : [],
    });
    if (!covers) {
      await prisma.jobOrder.update({ where: { id: jobOrder.id }, data: { consultantId: null } });
    }
  }

  return clearedOwnConsultant;
}

/** Returns true if the candidate's own `consultantId` was cleared. */
export async function clearMismatchedCandidateAssignment(
  prisma: ExtendedPrismaClient,
  candidateId: string,
): Promise<boolean> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { consultantId: true, industryId: true, locationId: true },
  });
  if (!candidate?.consultantId) return false;
  const covers = await consultantCovers(prisma, candidate.consultantId, {
    industryId: candidate.industryId,
    locationIds: [candidate.locationId],
  });
  if (covers) return false;
  await prisma.candidate.update({ where: { id: candidateId }, data: { consultantId: null } });
  return true;
}

/**
 * Re-checks every record this consultant owns after *any* grant change, and
 * unassigns the ones they no longer reach.
 *
 * Takes no "what was removed" list on purpose. With two arms granting
 * ownership, removing an industry no longer implies a record is stranded — the
 * location arm may still cover it — so the only correct test is to re-run the
 * same predicate over what they currently hold. Owned sets are small (a book,
 * not a market), so the per-record round trip is fine.
 */
export async function clearUncoveredConsultantAssignments(
  prisma: ExtendedPrismaClient,
  consultantId: string,
): Promise<void> {
  const [clients, candidates, jobOrders] = await Promise.all([
    prisma.client.findMany({
      where: { consultantId },
      select: { id: true, industryId: true, locations: { select: { locationId: true } } },
    }),
    prisma.candidate.findMany({
      where: { consultantId },
      select: { id: true, industryId: true, locationId: true },
    }),
    prisma.jobOrder.findMany({
      where: { consultantId },
      select: { id: true, locationId: true, client: { select: { industryId: true } } },
    }),
  ]);

  for (const client of clients) {
    const covers = await consultantCovers(prisma, consultantId, {
      industryId: client.industryId,
      locationIds: client.locations.map((l) => l.locationId),
    });
    if (!covers) await prisma.client.update({ where: { id: client.id }, data: { consultantId: null } });
  }
  for (const candidate of candidates) {
    const covers = await consultantCovers(prisma, consultantId, {
      industryId: candidate.industryId,
      locationIds: [candidate.locationId],
    });
    if (!covers) {
      await prisma.candidate.update({ where: { id: candidate.id }, data: { consultantId: null } });
    }
  }
  for (const jobOrder of jobOrders) {
    const covers = await consultantCovers(prisma, consultantId, {
      industryId: jobOrder.client.industryId,
      locationIds: jobOrder.locationId ? [jobOrder.locationId] : [],
    });
    if (!covers) {
      await prisma.jobOrder.update({ where: { id: jobOrder.id }, data: { consultantId: null } });
    }
  }
}
