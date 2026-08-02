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
 * `prefix` is where the industry lives relative to the record — Client and
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

export function clientScope(user: AuthUser): Prisma.ClientWhereInput {
  if (hasNoGrants(user)) return MATCH_NOTHING;
  return {
    OR: [
      industryArm(user, false),
      { locations: { some: locationIsUnder(user.locationIds) } },
    ],
  };
}

export function candidateScope(user: AuthUser): Prisma.CandidateWhereInput {
  if (hasNoGrants(user)) return MATCH_NOTHING as Prisma.CandidateWhereInput;
  const industry = industryArm(user, false) as Prisma.CandidateWhereInput;
  return { OR: [industry, locationIsUnder(user.locationIds)] };
}

export function jobOrderScope(user: AuthUser): Prisma.JobOrderWhereInput {
  if (hasNoGrants(user)) return MATCH_NOTHING as Prisma.JobOrderWhereInput;
  return {
    OR: [
      industryArm(user, true) as Prisma.JobOrderWhereInput,
      locationIsUnder(user.locationIds),
    ],
  };
}

export function jobResearchScope(user: AuthUser): Prisma.ClientJobResearchWhereInput {
  if (hasNoGrants(user)) return MATCH_NOTHING as Prisma.ClientJobResearchWhereInput;
  return {
    OR: [
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
  record: { industryId?: string | null; locationAncestorIds?: string[] },
): void {
  if (!isScoped(user)) return;

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
