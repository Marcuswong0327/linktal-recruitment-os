import { Prisma } from '@prisma/client';
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
 * industry or because it's in their patch. This is a pure LIST FILTER — there
 * is no 403 gate on direct access anymore, and no per-record `consultantId`
 * ownership on Client/Candidate either. The one deliberate way to reach an
 * out-of-scope Client/Candidate is to be added to a JobOrder
 * (`JobOrderConsultant`): that adds a third arm, scoped to that specific job
 * order's own Client and the Candidates submitted to it — nothing wider, and
 * no guard blocks it, by design.
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
 *
 * An empty-grants consultant needs no special case to see nothing: an empty
 * `industryIds`/`locationIds` array makes `{ in: [] }` / `{ hasSome: [] }`
 * evaluate to "matches nothing" in Prisma/Postgres on its own — there's
 * nothing left to fall back to now that there's no ownership arm.
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

/** The job-order-membership arm: is this consultant on the job order's consultant list? */
function assignedViaJobOrder(user: AuthUser) {
  return { consultants: { some: { consultantId: user.consultantId } } };
}

/** True when this caller is scoped at all. Everyone else sees everything. */
export function isScoped(user: AuthUser): boolean {
  return user.roleName === 'consultant';
}

// ---------------------------------------------------------------------------
// Per-entity `where` fragments
// ---------------------------------------------------------------------------
// Written out per entity rather than driven by a config object: the shapes
// differ in *where* each arm lives (own column vs. via Client, single FK vs.
// join table, direct vs. via a job order), and spelling them out reads better
// than a mapping layer that has to encode the same cases anyway.

export function clientScope(user: AuthUser): Prisma.ClientWhereInput {
  return {
    OR: [
      industryArm(user, false),
      { locations: { some: locationIsUnder(user.locationIds) } },
      { jobOrders: { some: { deletedAt: null, ...assignedViaJobOrder(user) } } },
    ],
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
  return {
    OR: [
      candidateIndustryArm(user),
      locationIsUnder(user.locationIds),
      {
        submissions: {
          some: { deletedAt: null, jobOrder: assignedViaJobOrder(user) },
        },
      },
    ],
  };
}

export function jobOrderScope(user: AuthUser): Prisma.JobOrderWhereInput {
  return {
    OR: [
      industryArm(user, true) as Prisma.JobOrderWhereInput,
      locationIsUnder(user.locationIds),
      assignedViaJobOrder(user),
    ],
  };
}

/**
 * Research carries no job-order-membership arm — `ClientJobResearch.consultantId`
 * ("who conducted this research") is descriptive metadata only, the same
 * treatment `Stakeholder.coverage` already got. Public market research isn't
 * job-order work yet (it's what happens *before* a job order might exist), so
 * there's no natural "member of this job order" concept to borrow here.
 */
export function jobResearchScope(user: AuthUser): Prisma.ClientJobResearchWhereInput {
  return {
    OR: [industryArm(user, true) as Prisma.ClientJobResearchWhereInput, locationIsUnder(user.locationIds)],
  };
}

/**
 * A stakeholder is visible exactly when its client is — no ownership arm of
 * its own (it has no `consultantId`; contacts belong to a client, not to a
 * recruiter), and no independent coverage check either. `coverage` is kept
 * purely as descriptive routing data (who to call about which patch), not a
 * scope gate.
 */
export function stakeholderScope(user: AuthUser): Prisma.StakeholderWhereInput {
  return { client: clientScope(user) };
}
