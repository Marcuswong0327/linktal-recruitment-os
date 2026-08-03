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

const MATCH_NOTHING: Prisma.ClientWhereInput = { id: { in: [] } };

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
 * `MATCH_NOTHING` therefore survives only for a caller with no grants *and* no
 * assignments — the genuinely unconfigured case.
 *
 * Stakeholder is the one entity with no ownership arm, because it has no
 * `consultantId`: contacts belong to a client, not to a recruiter.
 */
function ownedBy(user: AuthUser): { consultantId: string } {
  return { consultantId: user.consultantId };
}

/**
 * Clients carry one more arm than the rest: a company is also reachable
 * through a *contact* who covers the consultant's patch, even when the
 * company's own market sits outside it — the counterpart to the Stakeholder
 * asymmetry below. Without it the two rules disagree: a Sydney-scoped
 * consultant could open a Brisbane client's national account manager but got a
 * 403 on the company that person works for, which is a dangling reference
 * rather than a privacy boundary.
 *
 * Soft-deleted stakeholders are excluded explicitly, because the extended
 * client's soft-delete rewrite intercepts top-level calls, not a nested
 * relation filter, so a removed contact would otherwise keep granting access.
 * The test is "does *any* live contact cover my patch", so deleting one of
 * several changes nothing — access lapses only with the last one.
 */
export function clientScope(user: AuthUser): Prisma.ClientWhereInput {
  const owned = ownedBy(user);
  if (hasNoGrants(user)) return owned;
  return {
    OR: [
      owned,
      industryArm(user, false),
      { locations: { some: locationIsUnder(user.locationIds) } },
      { stakeholders: { some: { deletedAt: null, coverage: { some: locationIsUnder(user.locationIds) } } } },
    ],
  };
}

/**
 * A TOB carries no scope fields of its own — no industry, no location, no
 * `consultantId`. It's a commercial document belonging to a company, so it's
 * visible exactly when that company is, all four of `clientScope`'s arms
 * included. Delegating rather than restating them also means the
 * stakeholder-coverage arm can't drift out of sync here later.
 *
 * Soft-deleted clients need no explicit exclusion (unlike the nested
 * stakeholder filter in `clientScope`): `ClientsService.remove` soft-deletes a
 * client's TOBs alongside it, so the extended client's top-level rewrite has
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
 * Stakeholders are the one asymmetry, and it's deliberate: they're matched on
 * **their own coverage set**, not on where their employer sits. A Brisbane
 * client's national account manager whose coverage includes Sydney is
 * reachable by a Sydney-scoped consultant — that's the person you'd actually
 * call about a Sydney role.
 */
export function stakeholderScope(user: AuthUser): Prisma.StakeholderWhereInput {
  if (hasNoGrants(user)) return MATCH_NOTHING as Prisma.StakeholderWhereInput;
  return {
    OR: [
      industryArm(user, true) as Prisma.StakeholderWhereInput,
      { coverage: { some: locationIsUnder(user.locationIds) } },
    ],
  };
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

/** True if `consultantId` currently holds `industryId`. */
export async function consultantHasIndustry(
  prisma: ExtendedPrismaClient,
  consultantId: string,
  industryId: string | null | undefined,
): Promise<boolean> {
  if (!industryId) return false;
  const row = await prisma.consultantIndustry.findUnique({
    where: { consultantId_industryId: { consultantId, industryId } },
  });
  return row !== null;
}

/**
 * A Client/Candidate/JobOrder can only be assigned to a consultant who holds
 * its industry. Call with a null/undefined `consultantId` (clearing an
 * assignment) to skip — there's nothing to validate when unassigning.
 *
 * The old `INDUSTRY_REQUIRED` case is gone: `industryId` is a required column
 * now, so there's no untagged state left to guard against.
 */
export async function assertConsultantIndustryMatch(
  prisma: ExtendedPrismaClient,
  consultantId: string | null | undefined,
  industryId: string | null | undefined,
): Promise<void> {
  if (!consultantId) return;
  if (!(await consultantHasIndustry(prisma, consultantId, industryId))) {
    throw new BadRequestException({
      code: 'CONSULTANT_INDUSTRY_MISMATCH',
      message: 'This consultant is not assigned to this industry.',
    });
  }
}

/** Same guard for a Job Order, whose industry is only reachable via its Client. */
export async function assertConsultantIndustryMatchForJobOrder(
  prisma: ExtendedPrismaClient,
  consultantId: string | null | undefined,
  clientId: string,
): Promise<void> {
  if (!consultantId) return;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { industryId: true },
  });
  await assertConsultantIndustryMatch(prisma, consultantId, client?.industryId ?? null);
}

/**
 * Bidirectional auto-clear: a stale mismatched `consultantId` can never
 * persist. Two triggers, kept as separate named functions because "what
 * changed" has a different shape in each:
 *
 *  1. A Client/Candidate's own `industryId` changed.
 *  2. A consultant's assigned industries changed (`setIndustries`).
 */
export async function clearMismatchedClientAssignment(
  prisma: ExtendedPrismaClient,
  clientId: string,
  newIndustryId: string | null,
): Promise<boolean> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { consultantId: true },
  });
  let clearedOwnConsultant = false;
  if (client?.consultantId && !(await consultantHasIndustry(prisma, client.consultantId, newIndustryId))) {
    await prisma.client.update({ where: { id: clientId }, data: { consultantId: null } });
    clearedOwnConsultant = true;
  }

  // Cascade: this Client's Job Orders inherit its industry, so any of their
  // own consultants that no longer match get cleared too.
  const jobOrders = await prisma.jobOrder.findMany({
    where: { clientId, consultantId: { not: null } },
    select: { id: true, consultantId: true },
  });
  for (const jobOrder of jobOrders) {
    if (!(await consultantHasIndustry(prisma, jobOrder.consultantId as string, newIndustryId))) {
      await prisma.jobOrder.update({ where: { id: jobOrder.id }, data: { consultantId: null } });
    }
  }

  return clearedOwnConsultant;
}

/** Returns true if the candidate's own `consultantId` was cleared. */
export async function clearMismatchedCandidateAssignment(
  prisma: ExtendedPrismaClient,
  candidateId: string,
  newIndustryId: string | null,
): Promise<boolean> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { consultantId: true },
  });
  if (candidate?.consultantId && !(await consultantHasIndustry(prisma, candidate.consultantId, newIndustryId))) {
    await prisma.candidate.update({ where: { id: candidateId }, data: { consultantId: null } });
    return true;
  }
  return false;
}

export async function clearMismatchedConsultantAssignments(
  prisma: ExtendedPrismaClient,
  consultantId: string,
  removedIndustryIds: string[],
): Promise<void> {
  if (removedIndustryIds.length === 0) return;
  await prisma.client.updateMany({
    where: { consultantId, industryId: { in: removedIndustryIds } },
    data: { consultantId: null },
  });
  await prisma.candidate.updateMany({
    where: { consultantId, industryId: { in: removedIndustryIds } },
    data: { consultantId: null },
  });
  await prisma.jobOrder.updateMany({
    where: { consultantId, client: { industryId: { in: removedIndustryIds } } },
    data: { consultantId: null },
  });
}
