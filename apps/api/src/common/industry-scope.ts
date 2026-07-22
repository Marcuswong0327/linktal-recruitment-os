import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';

/**
 * Industry-based row scoping for the `consultant` role. Every other role
 * (admin/manager/finance/researcher/viewer) is unrestricted and never calls
 * these — see ClientsService/CandidatesService/StakeholdersService/
 * JobOrdersService `findAll`/`findOne` for the `roleName === 'consultant'`
 * gate.
 *
 * Strict, no null-passthrough: an untagged record (`industryId: null`) never
 * matches, for any consultant, including whoever it's nominally assigned to.
 * Confirmed safe against the dev DB before this was written (see the plan
 * this feature shipped from) — every consultant-assigned Client/Candidate/
 * Job Order already had an industry tagged, so this doesn't hide anything
 * that was actually in use.
 */
export function industryScope(industryIds: string[]): { industryId: { in: string[] } } {
  return { industryId: { in: industryIds } };
}

/** Same as `industryScope`, for Stakeholder/JobOrder — neither has its own `industryId`, only via their parent Client. */
export function industryScopeViaClient(industryIds: string[]): {
  client: { industryId: { in: string[] } };
} {
  return { client: { industryId: { in: industryIds } } };
}

/**
 * Single-record access guard: a `consultant`-role user reaching a specific
 * record directly (`findOne`/`update`/`remove`) whose industry doesn't match
 * gets an explicit 403, not a 404 — unlike list endpoints, which just filter
 * silently (see `industryScope`'s doc). No-op for every other role.
 */
export function assertInJobScope(user: AuthUser, industryId: string | null | undefined): void {
  if (user.roleName !== 'consultant') return;
  if (!industryId || !user.industryIds.includes(industryId)) {
    throw new ForbiddenException({
      code: 'OUT_OF_JOB_SCOPE',
      message: 'This is not under your job scope.',
    });
  }
}

/** True if `consultantId` currently has `industryId` assigned. A null/undefined industryId never matches anyone. */
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
 * The industry-first assignment guard: a Client/Candidate/Job Order can only
 * have a consultant assigned once it already has an industry tagged, and
 * only to a consultant who holds that industry. Call with `consultantId:
 * null/undefined` (clearing an assignment) to skip the check entirely —
 * there's nothing to validate when unassigning.
 */
export async function assertConsultantIndustryMatch(
  prisma: ExtendedPrismaClient,
  consultantId: string | null | undefined,
  industryId: string | null | undefined,
): Promise<void> {
  if (!consultantId) return;
  if (!industryId) {
    throw new BadRequestException({
      code: 'INDUSTRY_REQUIRED',
      message: 'Tag an industry before assigning a consultant.',
    });
  }
  if (!(await consultantHasIndustry(prisma, consultantId, industryId))) {
    throw new BadRequestException({
      code: 'CONSULTANT_INDUSTRY_MISMATCH',
      message: 'This consultant is not assigned to this industry.',
    });
  }
}

/** Same guard for a Job Order, which has no `industryId` of its own — resolved via its Client. */
export async function assertConsultantIndustryMatchForJobOrder(
  prisma: ExtendedPrismaClient,
  consultantId: string | null | undefined,
  clientId: string,
): Promise<void> {
  if (!consultantId) return;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { industryId: true } });
  await assertConsultantIndustryMatch(prisma, consultantId, client?.industryId ?? null);
}

/**
 * Bidirectional auto-clear invariant: a stale mismatched `consultantId` can
 * never persist. These three functions cover both triggers —
 *
 *  1. A Client/Candidate's own `industryId` changes (`clearMismatchedClientAssignment`/
 *     `clearMismatchedCandidateAssignment`, called from ClientsService/CandidatesService.update
 *     after the industryId write lands).
 *  2. A consultant's assigned industries change (`clearMismatchedConsultantAssignments`,
 *     called from ConsultantsService.setIndustries with the set of industries just removed).
 *
 * — rather than one polymorphic dispatcher, since the two triggers touch
 * different shapes of "what changed" and read better named separately.
 */
/** Returns true if the client's own `consultantId` was cleared, so the caller knows whether its cached response is now stale. */
export async function clearMismatchedClientAssignment(
  prisma: ExtendedPrismaClient,
  clientId: string,
  newIndustryId: string | null,
): Promise<boolean> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { consultantId: true } });
  let clearedOwnConsultant = false;
  if (client?.consultantId && !(await consultantHasIndustry(prisma, client.consultantId, newIndustryId))) {
    await prisma.client.update({ where: { id: clientId }, data: { consultantId: null } });
    clearedOwnConsultant = true;
  }

  // Cascade: this Client's Job Orders inherit its industry — any of their own
  // consultants that no longer match the (possibly new) industry get cleared too.
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
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { consultantId: true } });
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
  const where: Prisma.ClientWhereInput = { consultantId, industryId: { in: removedIndustryIds } };
  await prisma.client.updateMany({ where, data: { consultantId: null } });
  await prisma.candidate.updateMany({
    where: { consultantId, industryId: { in: removedIndustryIds } },
    data: { consultantId: null },
  });
  await prisma.jobOrder.updateMany({
    where: { consultantId, client: { industryId: { in: removedIndustryIds } } },
    data: { consultantId: null },
  });
}
