import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertConsultantIndustryMatch,
  assertConsultantIndustryMatchForJobOrder,
  assertInScope,
  candidateScope,
  clearMismatchedCandidateAssignment,
  clearMismatchedClientAssignment,
  clearMismatchedConsultantAssignments,
  clientScope,
  consultantHasIndustry,
  isScoped,
  jobOrderScope,
  jobResearchScope,
  stakeholderScope,
  tobScope,
} from './scope';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { AuthUser } from '../auth/auth.types';

/**
 * Direct tests for the row-level visibility resolver.
 *
 * Every service spec exercises scoping incidentally, through whichever arm that
 * entity happens to use. This file tests the resolver itself — the composition
 * of the arms, the two short-circuits that bracket them, and the assignment
 * guards that keep a stale `consultantId` from surviving an industry change.
 * It's the security boundary, so the assertions are on the exact `where` shape
 * handed to Prisma rather than on "did it filter something".
 *
 * The rule, from CLAUDE.md:
 *
 *     visible = (industry match AND specialization match) OR (location match)
 *
 * plus an ownership arm above it (`consultantId = me` always wins) and a
 * no-grants short-circuit below it (zero grants means *not configured*, never
 * *sees everything*).
 */

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    consultantId: 'me',
    azureId: 'azure-1',
    email: 'me@example.com',
    fullName: 'Me',
    roleName: 'consultant',
    isActive: true,
    permissions: new Set(),
    industryIds: ['ind1'],
    specializationIds: [],
    locationIds: ['nsw'],
    ...overrides,
  };
}

/** A consultant with grants on neither axis — the genuinely unconfigured case. */
const noGrants = (overrides: Partial<AuthUser> = {}) =>
  makeUser({ industryIds: [], locationIds: [], ...overrides });

describe('isScoped', () => {
  it('scopes the consultant role and nothing else', () => {
    expect(isScoped(makeUser({ roleName: 'consultant' }))).toBe(true);
    for (const roleName of ['admin', 'manager', 'finance', 'researcher', 'viewer']) {
      expect(isScoped(makeUser({ roleName }))).toBe(false);
    }
  });
});

// Zero grants must never resolve to "everything". Wildcards are materialised
// into concrete grant rows at assignment time precisely so this case can stay
// closed.
describe('the no-grants short-circuit', () => {
  it('collapses every owning entity to its ownership arm alone', () => {
    const user = noGrants();
    expect(clientScope(user)).toEqual({ consultantId: 'me' });
    expect(candidateScope(user)).toEqual({ consultantId: 'me' });
    expect(jobOrderScope(user)).toEqual({ consultantId: 'me' });
    expect(jobResearchScope(user)).toEqual({ consultantId: 'me' });
  });

  it('collapses Stakeholder to match-nothing, since it has no owner', () => {
    // Stakeholder is the one entity with no `consultantId` — contacts belong to
    // a client, not a recruiter — so there is no ownership arm to fall back to.
    expect(stakeholderScope(noGrants())).toEqual({ id: { in: [] } });
  });

  it('does not fire when only one axis is empty — a grant on either counts as configured', () => {
    // hasNoGrants requires BOTH axes empty. A consultant with industries but no
    // locations is configured, and gets the full OR.
    expect(clientScope(makeUser({ locationIds: [] }))).toHaveProperty('OR');
    expect(clientScope(makeUser({ industryIds: [] }))).toHaveProperty('OR');
  });
});

describe('the ownership arm', () => {
  // An assignment is a deliberate admin act on one specific row, so honouring
  // it doesn't reopen the "zero grants means everything" hole.
  it('is the first arm of every owning entity, above the industry/location arms', () => {
    const user = makeUser();
    for (const scope of [clientScope(user), candidateScope(user), jobOrderScope(user), jobResearchScope(user)]) {
      expect((scope as { OR: unknown[] }).OR[0]).toEqual({ consultantId: 'me' });
    }
  });

  it('is absent from Stakeholder entirely', () => {
    const arms = (stakeholderScope(makeUser()) as { OR: unknown[] }).OR;
    expect(arms).toHaveLength(2);
    expect(JSON.stringify(arms)).not.toContain('consultantId');
  });
});

describe('clientScope', () => {
  it('has four arms: owned, industry, own market, and a contact’s coverage', () => {
    const scope = clientScope(makeUser());
    expect(scope.OR).toEqual([
      { consultantId: 'me' },
      { industryId: { in: ['ind1'] } },
      { locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
      {
        stakeholders: {
          some: { deletedAt: null, coverage: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
        },
      },
    ]);
  });

  // The extended client's soft-delete rewrite intercepts top-level calls, not a
  // nested relation filter — so a removed contact would otherwise keep granting
  // access to their employer forever.
  it('excludes soft-deleted stakeholders from the coverage arm explicitly', () => {
    const arms = clientScope(makeUser()).OR as unknown as { stakeholders: { some: object } }[];
    expect(arms[3].stakeholders.some).toHaveProperty('deletedAt', null);
  });
});

describe('tobScope', () => {
  // A TOB carries no scope fields of its own, so it delegates wholesale rather
  // than restating the arms — which is what keeps the coverage arm above from
  // drifting out of sync here.
  it('is exactly clientScope, nested under the client relation', () => {
    const user = makeUser();
    expect(tobScope(user)).toEqual({ client: clientScope(user) });
  });

  it('inherits the ownership short-circuit through the same delegation', () => {
    expect(tobScope(noGrants())).toEqual({ client: { consultantId: 'me' } });
  });
});

describe('where each entity reaches its industry from', () => {
  // Client and Candidate own their industryId. JobOrder, ClientJobResearch and
  // Stakeholder have none of their own and reach it through the parent Client.
  it('reads it off the row for Client and Candidate', () => {
    expect((clientScope(makeUser()).OR as Record<string, unknown>[])[1]).toEqual({
      industryId: { in: ['ind1'] },
    });
    expect((candidateScope(makeUser()).OR as Record<string, unknown>[])[1]).toEqual({
      industryId: { in: ['ind1'] },
    });
  });

  it('reads it via the client for JobOrder, JobResearch and Stakeholder', () => {
    const viaClient = { client: { industryId: { in: ['ind1'] } } };
    expect((jobOrderScope(makeUser()).OR as unknown[])[1]).toEqual(viaClient);
    expect((jobResearchScope(makeUser()).OR as unknown[])[1]).toEqual(viaClient);
    expect((stakeholderScope(makeUser()).OR as unknown[])[0]).toEqual(viaClient);
  });
});

describe('where each entity reaches its location from', () => {
  const under = { location: { ancestorIds: { hasSome: ['nsw'] } } };

  it('uses a single FK for Candidate, JobOrder and JobResearch', () => {
    expect((candidateScope(makeUser()).OR as unknown[])[2]).toEqual(under);
    expect((jobOrderScope(makeUser()).OR as unknown[])[2]).toEqual(under);
    expect((jobResearchScope(makeUser()).OR as unknown[])[2]).toEqual(under);
  });

  it('uses a join for Client (a market set) and Stakeholder (a coverage set)', () => {
    expect((clientScope(makeUser()).OR as unknown[])[2]).toEqual({ locations: { some: under } });
    expect((stakeholderScope(makeUser()).OR as unknown[])[1]).toEqual({ coverage: { some: under } });
  });

  // A grant covers the granted node plus every descendant, matched through the
  // denormalized ancestorIds column — never by expanding the grant downward,
  // which for one COUNTRY:Australia grant would mean 1,500+ nodes.
  it('matches descendants via ancestorIds rather than expanding the grant', () => {
    const scope = candidateScope(makeUser({ locationIds: ['au', 'my'] }));
    expect((scope.OR as unknown[])[2]).toEqual({
      location: { ancestorIds: { hasSome: ['au', 'my'] } },
    });
  });
});

describe('the specialization narrowing', () => {
  // Holding no specializations means "the whole industry", not "nothing" —
  // otherwise switching the arm on would empty every consultant's list.
  it('leaves the industry arm unnarrowed when the consultant holds none', () => {
    expect((candidateScope(makeUser({ specializationIds: [] })).OR as unknown[])[1]).toEqual({
      industryId: { in: ['ind1'] },
    });
  });

  // ~72% of candidates carry no specialization; without this passthrough they'd
  // all vanish the moment the arm activates.
  //
  // Candidate is spelled differently from every other entity on purpose: it
  // holds a *set* of specializations (`CandidateSpecialization[]`) and has no
  // `specializationId` column, so `none: {}` is its "unspecialised". Reusing
  // the Client shape here previously produced a `where` Prisma rejects outright
  // — see the regression test below.
  it('lets an unspecialised candidate pass on its industry alone', () => {
    const arm = (candidateScope(makeUser({ specializationIds: ['spec1'] })).OR as Record<string, never>[])[1];
    expect(arm).toEqual({
      industryId: { in: ['ind1'] },
      OR: [
        { specializations: { none: {} } },
        { specializations: { some: { specialization: { ancestorIds: { hasSome: ['spec1'] } } } } },
      ],
    });
  });

  // Regression: Client has a scalar `specializationId`, Candidate does not.
  // Casting the Client arm across compiled fine and passed a mocked-Prisma
  // test, then 500'd against the real database for every consultant holding a
  // specialization grant — which is all of them.
  it('never emits a scalar specializationId for Candidate', () => {
    const emitted = JSON.stringify(candidateScope(makeUser({ specializationIds: ['spec1'] })));
    expect(emitted).not.toContain('"specializationId"');
    // Client, which does have the column, still uses it.
    expect(JSON.stringify(clientScope(makeUser({ specializationIds: ['spec1'] })))).toContain('"specializationId"');
  });

  it('narrows through the client relation too, for the via-client entities', () => {
    const arms = jobOrderScope(makeUser({ specializationIds: ['spec1'] })).OR as unknown as {
      client: { OR: unknown[] };
    }[];
    expect(arms[1].client.OR).toHaveLength(2);
  });
});

describe('assertInScope', () => {
  it('never restricts an unscoped role, whatever the record looks like', () => {
    for (const roleName of ['admin', 'manager', 'finance', 'researcher', 'viewer']) {
      expect(() =>
        assertInScope(makeUser({ roleName }), { industryId: 'other', locationAncestorIds: [] }),
      ).not.toThrow();
    }
  });

  it('throws OUT_OF_JOB_SCOPE when neither arm matches', () => {
    expect(() =>
      assertInScope(makeUser(), { industryId: 'other', locationAncestorIds: ['qld'] }),
    ).toThrow(ForbiddenException);

    try {
      assertInScope(makeUser(), { industryId: 'other', locationAncestorIds: ['qld'] });
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'OUT_OF_JOB_SCOPE',
      });
    }
  });

  it('passes on the industry arm alone, and on the location arm alone', () => {
    expect(() => assertInScope(makeUser(), { industryId: 'ind1', locationAncestorIds: ['qld'] })).not.toThrow();
    expect(() =>
      assertInScope(makeUser(), { industryId: 'other', locationAncestorIds: ['syd', 'nsw', 'au'] }),
    ).not.toThrow();
  });

  // The single-record half of the ownership arm — an assigned record is always
  // its owner's to open, even after its industry is retagged out from under it.
  it('short-circuits on ownership before either arm is consulted', () => {
    expect(() =>
      assertInScope(noGrants(), {
        consultantId: 'me',
        industryId: 'other',
        locationAncestorIds: ['qld'],
      }),
    ).not.toThrow();
  });

  it('does not treat someone else’s assignment as ownership', () => {
    expect(() =>
      assertInScope(makeUser(), { consultantId: 'someone-else', industryId: 'other', locationAncestorIds: [] }),
    ).toThrow(ForbiddenException);
  });

  // Stakeholder omits consultantId entirely; a null must not accidentally match
  // a caller whose own consultantId is somehow nullish.
  it('treats an absent consultantId as "no ownership", not a match', () => {
    expect(() =>
      assertInScope(makeUser(), { industryId: 'other', locationAncestorIds: [] }),
    ).toThrow(ForbiddenException);
  });

  it('tolerates an omitted location list', () => {
    expect(() => assertInScope(makeUser(), { industryId: 'ind1' })).not.toThrow();
  });

  // industryId is required on Client/Candidate, but JobOrder/Stakeholder read
  // theirs through a client that may be missing — a null must never match.
  it('never matches a null industry against a grant', () => {
    expect(() => assertInScope(makeUser(), { industryId: null, locationAncestorIds: [] })).toThrow(
      ForbiddenException,
    );
  });
});

// ---------------------------------------------------------------------------
// Assignment guards
// ---------------------------------------------------------------------------

function makePrisma(overrides: Record<string, unknown> = {}) {
  return overrides as unknown as ExtendedPrismaClient;
}

describe('consultantHasIndustry', () => {
  it('looks the grant up by its composite key', async () => {
    const findUnique = jest.fn().mockResolvedValue({ consultantId: 'c1', industryId: 'ind1' });
    const prisma = makePrisma({ consultantIndustry: { findUnique } });

    await expect(consultantHasIndustry(prisma, 'c1', 'ind1')).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { consultantId_industryId: { consultantId: 'c1', industryId: 'ind1' } },
    });
  });

  it('is false for a missing grant, and short-circuits on a null industry', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = makePrisma({ consultantIndustry: { findUnique } });

    await expect(consultantHasIndustry(prisma, 'c1', 'ind1')).resolves.toBe(false);

    findUnique.mockClear();
    await expect(consultantHasIndustry(prisma, 'c1', null)).resolves.toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('assertConsultantIndustryMatch', () => {
  it('skips entirely when there is no consultant to validate (an unassign)', async () => {
    const findUnique = jest.fn();
    const prisma = makePrisma({ consultantIndustry: { findUnique } });

    await expect(assertConsultantIndustryMatch(prisma, null, 'ind1')).resolves.toBeUndefined();
    await expect(assertConsultantIndustryMatch(prisma, undefined, 'ind1')).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('throws CONSULTANT_INDUSTRY_MISMATCH when the consultant lacks the industry', async () => {
    const prisma = makePrisma({ consultantIndustry: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(assertConsultantIndustryMatch(prisma, 'c1', 'ind1')).rejects.toThrow(BadRequestException);

    await assertConsultantIndustryMatch(prisma, 'c1', 'ind1').catch((error: BadRequestException) => {
      expect(error.getResponse()).toMatchObject({ code: 'CONSULTANT_INDUSTRY_MISMATCH' });
    });
  });
});

describe('assertConsultantIndustryMatchForJobOrder', () => {
  it('resolves the industry through the job order’s client', async () => {
    const clientFindUnique = jest.fn().mockResolvedValue({ industryId: 'ind1' });
    const grantFindUnique = jest.fn().mockResolvedValue({ id: 'g1' });
    const prisma = makePrisma({
      client: { findUnique: clientFindUnique },
      consultantIndustry: { findUnique: grantFindUnique },
    });

    await assertConsultantIndustryMatchForJobOrder(prisma, 'c1', 'cl1');
    expect(clientFindUnique).toHaveBeenCalledWith({
      where: { id: 'cl1' },
      select: { industryId: true },
    });
    expect(grantFindUnique.mock.calls[0][0].where.consultantId_industryId.industryId).toBe('ind1');
  });

  it('does not even read the client when there is no consultant to validate', async () => {
    const clientFindUnique = jest.fn();
    await assertConsultantIndustryMatchForJobOrder(
      makePrisma({ client: { findUnique: clientFindUnique } }),
      null,
      'cl1',
    );
    expect(clientFindUnique).not.toHaveBeenCalled();
  });
});

// A stale mismatched consultantId must never survive an industry change —
// otherwise the ownership arm would keep handing someone a record they no
// longer qualify for.
describe('clearMismatchedClientAssignment', () => {
  function setup(clientConsultantId: string | null, jobOrders: { id: string; consultantId: string }[] = []) {
    const clientFindUnique = jest.fn().mockResolvedValue({ consultantId: clientConsultantId });
    const clientUpdate = jest.fn().mockResolvedValue({});
    const jobOrderFindMany = jest.fn().mockResolvedValue(jobOrders);
    const jobOrderUpdate = jest.fn().mockResolvedValue({});
    const grantFindUnique = jest.fn().mockResolvedValue(null); // nobody holds the new industry
    const prisma = makePrisma({
      client: { findUnique: clientFindUnique, update: clientUpdate },
      jobOrder: { findMany: jobOrderFindMany, update: jobOrderUpdate },
      consultantIndustry: { findUnique: grantFindUnique },
    });
    return { prisma, clientUpdate, jobOrderUpdate, jobOrderFindMany };
  }

  it('clears the client’s own consultant and reports that it did', async () => {
    const { prisma, clientUpdate } = setup('c1');
    await expect(clearMismatchedClientAssignment(prisma, 'cl1', 'ind2')).resolves.toBe(true);
    expect(clientUpdate).toHaveBeenCalledWith({ where: { id: 'cl1' }, data: { consultantId: null } });
  });

  // Job Orders inherit their client's industry, so retagging the client has to
  // cascade to them as well.
  it('cascades to the client’s job orders', async () => {
    const { prisma, jobOrderUpdate, jobOrderFindMany } = setup(null, [
      { id: 'jo1', consultantId: 'c1' },
      { id: 'jo2', consultantId: 'c2' },
    ]);
    await clearMismatchedClientAssignment(prisma, 'cl1', 'ind2');

    expect(jobOrderFindMany).toHaveBeenCalledWith({
      where: { clientId: 'cl1', consultantId: { not: null } },
      select: { id: true, consultantId: true },
    });
    expect(jobOrderUpdate).toHaveBeenCalledTimes(2);
  });

  it('reports false when the client had no consultant to clear', async () => {
    const { prisma, clientUpdate } = setup(null);
    await expect(clearMismatchedClientAssignment(prisma, 'cl1', 'ind2')).resolves.toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('leaves a still-valid assignment alone', async () => {
    const { prisma, clientUpdate } = setup('c1');
    (prisma.consultantIndustry.findUnique as jest.Mock).mockResolvedValue({ id: 'g1' });
    await expect(clearMismatchedClientAssignment(prisma, 'cl1', 'ind2')).resolves.toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });
});

describe('clearMismatchedCandidateAssignment', () => {
  it('clears a now-invalid assignment and reports it', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({
      candidate: { findUnique: jest.fn().mockResolvedValue({ consultantId: 'c1' }), update },
      consultantIndustry: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(clearMismatchedCandidateAssignment(prisma, 'cd1', 'ind2')).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: 'cd1' }, data: { consultantId: null } });
  });

  it('leaves an unassigned candidate alone', async () => {
    const update = jest.fn();
    const prisma = makePrisma({
      candidate: { findUnique: jest.fn().mockResolvedValue({ consultantId: null }), update },
      consultantIndustry: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(clearMismatchedCandidateAssignment(prisma, 'cd1', 'ind2')).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

// The other direction: the consultant's own grants changed, so everything they
// hold in a removed industry gets released.
describe('clearMismatchedConsultantAssignments', () => {
  function setup() {
    const clientUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const candidateUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const jobOrderUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    return {
      prisma: makePrisma({
        client: { updateMany: clientUpdateMany },
        candidate: { updateMany: candidateUpdateMany },
        jobOrder: { updateMany: jobOrderUpdateMany },
      }),
      clientUpdateMany,
      candidateUpdateMany,
      jobOrderUpdateMany,
    };
  }

  it('releases clients, candidates and job orders in the removed industries', async () => {
    const { prisma, clientUpdateMany, candidateUpdateMany, jobOrderUpdateMany } = setup();
    await clearMismatchedConsultantAssignments(prisma, 'c1', ['ind2', 'ind3']);

    expect(clientUpdateMany).toHaveBeenCalledWith({
      where: { consultantId: 'c1', industryId: { in: ['ind2', 'ind3'] } },
      data: { consultantId: null },
    });
    expect(candidateUpdateMany).toHaveBeenCalledWith({
      where: { consultantId: 'c1', industryId: { in: ['ind2', 'ind3'] } },
      data: { consultantId: null },
    });
    // JobOrder has no industry of its own — matched through its client.
    expect(jobOrderUpdateMany).toHaveBeenCalledWith({
      where: { consultantId: 'c1', client: { industryId: { in: ['ind2', 'ind3'] } } },
      data: { consultantId: null },
    });
  });

  it('is a no-op when nothing was removed', async () => {
    const { prisma, clientUpdateMany } = setup();
    await clearMismatchedConsultantAssignments(prisma, 'c1', []);
    expect(clientUpdateMany).not.toHaveBeenCalled();
  });
});
