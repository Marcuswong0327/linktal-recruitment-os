import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertConsultantCovers,
  assertConsultantCoversJobOrder,
  assertInScope,
  candidateScope,
  clearMismatchedCandidateAssignment,
  clearMismatchedClientAssignment,
  clearUncoveredConsultantAssignments,
  clientScope,
  consultantCovers,
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

  it('collapses Stakeholder the same way its client does, since it delegates entirely', () => {
    // Stakeholder is the one entity with no `consultantId` of its own — but it
    // no longer needs one, since it inherits its client's scope wholesale.
    const user = noGrants();
    expect(stakeholderScope(user)).toEqual({ client: { consultantId: 'me' } });
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

  // Stakeholder has no `consultantId` of its own, but the ownership arm still
  // reaches it — nested one level down, through the client it delegates to.
  it('reaches Stakeholder through its client delegation, not directly', () => {
    const scope = stakeholderScope(makeUser()) as { client: { OR: unknown[] } };
    expect(scope.client.OR[0]).toEqual({ consultantId: 'me' });
  });
});

describe('clientScope', () => {
  it('has three arms: owned, industry, and own market', () => {
    const scope = clientScope(makeUser());
    expect(scope.OR).toEqual([
      { consultantId: 'me' },
      { industryId: { in: ['ind1'] } },
      { locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
    ]);
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

  it('reads it via the client for JobOrder and JobResearch', () => {
    const viaClient = { client: { industryId: { in: ['ind1'] } } };
    expect((jobOrderScope(makeUser()).OR as unknown[])[1]).toEqual(viaClient);
    expect((jobResearchScope(makeUser()).OR as unknown[])[1]).toEqual(viaClient);
  });

  // Stakeholder doesn't have its own via-client arm the way JobOrder/JobResearch
  // do — it delegates its *entire* scope to clientScope, industry included.
  it('delegates entirely for Stakeholder, rather than restating a via-client arm', () => {
    const user = makeUser();
    expect(stakeholderScope(user)).toEqual({ client: clientScope(user) });
  });
});

describe('where each entity reaches its location from', () => {
  const under = { location: { ancestorIds: { hasSome: ['nsw'] } } };

  it('uses a single FK for Candidate, JobOrder and JobResearch', () => {
    expect((candidateScope(makeUser()).OR as unknown[])[2]).toEqual(under);
    expect((jobOrderScope(makeUser()).OR as unknown[])[2]).toEqual(under);
    expect((jobResearchScope(makeUser()).OR as unknown[])[2]).toEqual(under);
  });

  // Stakeholder's own `coverage` set no longer factors into its location arm at
  // all — it inherits the client's market set through the same delegation
  // tested above, not a join on its own coverage.
  it('uses a join for Client (a market set)', () => {
    expect((clientScope(makeUser()).OR as unknown[])[2]).toEqual({ locations: { some: under } });
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


/**
 * Grants are read as two `findMany`s, and the location arm resolves through a
 * `location.count` on `ancestorIds` — the same test the scopes above use, so a
 * COUNTRY grant covers a CITY-tagged record here exactly as it does there.
 */
function makeGrantedPrisma(
  grants: { industryIds?: string[]; locationIds?: string[] },
  extra: Record<string, unknown> = {},
) {
  return makePrisma({
    consultantIndustry: {
      findMany: jest.fn().mockResolvedValue((grants.industryIds ?? []).map((industryId) => ({ industryId }))),
    },
    consultantLocation: {
      findMany: jest.fn().mockResolvedValue((grants.locationIds ?? []).map((locationId) => ({ locationId }))),
    },
    // Default: no record location sits under a granted node.
    location: { count: jest.fn().mockResolvedValue(0) },
    ...extra,
  });
}

describe('consultantCovers', () => {
  it('matches on industry without touching the location tree', async () => {
    const prisma = makeGrantedPrisma({ industryIds: ['ind1'], locationIds: ['loc1'] });
    await expect(
      consultantCovers(prisma, 'c1', { industryId: 'ind1', locationIds: ['locX'] }),
    ).resolves.toBe(true);
    expect(prisma.location.count).not.toHaveBeenCalled();
  });

  // The whole point of the rewrite: location alone is now enough. A consultant
  // whose only industry holds zero records could previously own nothing at all.
  it('matches on location when the industry does not', async () => {
    const prisma = makeGrantedPrisma({ industryIds: ['ind1'], locationIds: ['au'] });
    (prisma.location.count as jest.Mock).mockResolvedValue(1);

    await expect(
      consultantCovers(prisma, 'c1', { industryId: 'ind2', locationIds: ['sydney'] }),
    ).resolves.toBe(true);
    expect(prisma.location.count).toHaveBeenCalledWith({
      where: { id: { in: ['sydney'] }, ancestorIds: { hasSome: ['au'] } },
    });
  });

  it('is false when neither arm matches', async () => {
    const prisma = makeGrantedPrisma({ industryIds: ['ind1'], locationIds: ['au'] });
    await expect(
      consultantCovers(prisma, 'c1', { industryId: 'ind2', locationIds: ['kl'] }),
    ).resolves.toBe(false);
  });

  it('short-circuits the location query when either side is empty', async () => {
    const noGrant = makeGrantedPrisma({ industryIds: ['ind1'] });
    await expect(
      consultantCovers(noGrant, 'c1', { industryId: null, locationIds: ['sydney'] }),
    ).resolves.toBe(false);
    expect(noGrant.location.count).not.toHaveBeenCalled();

    const noRecordLocation = makeGrantedPrisma({ locationIds: ['au'] });
    await expect(
      consultantCovers(noRecordLocation, 'c1', { industryId: null, locationIds: [] }),
    ).resolves.toBe(false);
    expect(noRecordLocation.location.count).not.toHaveBeenCalled();
  });

  // A Client carries a *set* of markets; covering any one of them is enough.
  it('accepts a record whose second location is the covered one', async () => {
    const prisma = makeGrantedPrisma({ locationIds: ['au'] });
    (prisma.location.count as jest.Mock).mockResolvedValue(1);
    await expect(
      consultantCovers(prisma, 'c1', { industryId: null, locationIds: ['kl', 'sydney'] }),
    ).resolves.toBe(true);
  });
});

describe('assertConsultantCovers', () => {
  it('skips entirely when there is no consultant to validate (an unassign)', async () => {
    const prisma = makeGrantedPrisma({});
    await expect(
      assertConsultantCovers(prisma, null, { industryId: 'ind1', locationIds: [] }),
    ).resolves.toBeUndefined();
    await expect(
      assertConsultantCovers(prisma, undefined, { industryId: 'ind1', locationIds: [] }),
    ).resolves.toBeUndefined();
    expect(prisma.consultantIndustry.findMany).not.toHaveBeenCalled();
  });

  it('throws CONSULTANT_SCOPE_MISMATCH when neither arm covers the record', async () => {
    const prisma = makeGrantedPrisma({ industryIds: ['ind1'], locationIds: ['au'] });
    const record = { industryId: 'ind2', locationIds: ['kl'] };

    await expect(assertConsultantCovers(prisma, 'c1', record)).rejects.toThrow(BadRequestException);
    await assertConsultantCovers(prisma, 'c1', record).catch((error: BadRequestException) => {
      expect(error.getResponse()).toMatchObject({ code: 'CONSULTANT_SCOPE_MISMATCH' });
    });
  });

  it('passes silently when one arm covers it', async () => {
    const prisma = makeGrantedPrisma({ industryIds: ['ind1'] });
    await expect(
      assertConsultantCovers(prisma, 'c1', { industryId: 'ind1', locationIds: [] }),
    ).resolves.toBeUndefined();
  });

  it('lets admin/manager override a mismatch without even reading the grants', async () => {
    const prisma = makeGrantedPrisma({}); // holds nothing
    const record = { industryId: 'ind2', locationIds: ['kl'] };
    await expect(assertConsultantCovers(prisma, 'c1', record, 'admin')).resolves.toBeUndefined();
    await expect(assertConsultantCovers(prisma, 'c1', record, 'manager')).resolves.toBeUndefined();
    expect(prisma.consultantIndustry.findMany).not.toHaveBeenCalled();
  });

  it('still enforces the guard for every other role, including consultant/researcher', async () => {
    const prisma = makeGrantedPrisma({});
    const record = { industryId: 'ind2', locationIds: ['kl'] };
    await expect(assertConsultantCovers(prisma, 'c1', record, 'consultant')).rejects.toThrow(
      BadRequestException,
    );
    await expect(assertConsultantCovers(prisma, 'c1', record, 'researcher')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('assertConsultantCoversJobOrder', () => {
  it('takes industry from the client and location from the job order', async () => {
    const clientFindUnique = jest.fn().mockResolvedValue({ industryId: 'ind1' });
    const prisma = makeGrantedPrisma(
      { industryIds: [], locationIds: ['au'] },
      { client: { findUnique: clientFindUnique } },
    );
    (prisma.location.count as jest.Mock).mockResolvedValue(1);

    await assertConsultantCoversJobOrder(prisma, 'c1', 'cl1', 'sydney');

    expect(clientFindUnique).toHaveBeenCalledWith({
      where: { id: 'cl1' },
      select: { industryId: true },
    });
    expect(prisma.location.count).toHaveBeenCalledWith({
      where: { id: { in: ['sydney'] }, ancestorIds: { hasSome: ['au'] } },
    });
  });

  // JobOrder.locationId is nullable — an untagged job order has only the
  // client's industry to qualify on.
  it('falls back to the client industry when the job order has no location', async () => {
    const prisma = makeGrantedPrisma(
      { industryIds: ['ind1'] },
      { client: { findUnique: jest.fn().mockResolvedValue({ industryId: 'ind1' }) } },
    );
    await expect(assertConsultantCoversJobOrder(prisma, 'c1', 'cl1', null)).resolves.toBeUndefined();
    expect(prisma.location.count).not.toHaveBeenCalled();
  });

  it('does not even read the client when there is no consultant to validate', async () => {
    const clientFindUnique = jest.fn();
    await assertConsultantCoversJobOrder(
      makePrisma({ client: { findUnique: clientFindUnique } }),
      null,
      'cl1',
      'sydney',
    );
    expect(clientFindUnique).not.toHaveBeenCalled();
  });

  it('lets admin/manager override a mismatch without reading the client at all', async () => {
    const clientFindUnique = jest.fn();
    const prisma = makeGrantedPrisma({}, { client: { findUnique: clientFindUnique } });
    await expect(
      assertConsultantCoversJobOrder(prisma, 'c1', 'cl1', 'sydney', 'admin'),
    ).resolves.toBeUndefined();
    expect(clientFindUnique).not.toHaveBeenCalled();
  });
});

// A stale mismatched consultantId must never survive an industry or location
// change — otherwise the ownership arm would keep handing someone a record
// they no longer qualify for.
describe('clearMismatchedClientAssignment', () => {
  function setup(
    client: { consultantId: string | null; industryId?: string; locationIds?: string[] } | null,
    jobOrders: { id: string; consultantId: string; locationId: string | null }[] = [],
  ) {
    const clientFindUnique = jest.fn().mockResolvedValue(
      client && {
        consultantId: client.consultantId,
        industryId: client.industryId ?? 'ind1',
        locations: (client.locationIds ?? []).map((locationId) => ({ locationId })),
      },
    );
    const clientUpdate = jest.fn().mockResolvedValue({});
    const jobOrderFindMany = jest.fn().mockResolvedValue(jobOrders);
    const jobOrderUpdate = jest.fn().mockResolvedValue({});
    // Nobody holds anything — every assignment looks stranded unless a test
    // says otherwise.
    const prisma = makeGrantedPrisma(
      {},
      {
        client: { findUnique: clientFindUnique, update: clientUpdate },
        jobOrder: { findMany: jobOrderFindMany, update: jobOrderUpdate },
      },
    );
    return { prisma, clientUpdate, jobOrderUpdate, jobOrderFindMany };
  }

  it('clears the client’s own consultant and reports that it did', async () => {
    const { prisma, clientUpdate } = setup({ consultantId: 'c1' });
    await expect(clearMismatchedClientAssignment(prisma, 'cl1')).resolves.toBe(true);
    expect(clientUpdate).toHaveBeenCalledWith({ where: { id: 'cl1' }, data: { consultantId: null } });
  });

  // Job Orders inherit their client's industry, so retagging the client has to
  // cascade to them as well.
  it('cascades to the client’s job orders', async () => {
    const { prisma, jobOrderUpdate, jobOrderFindMany } = setup({ consultantId: null }, [
      { id: 'jo1', consultantId: 'c1', locationId: null },
      { id: 'jo2', consultantId: 'c2', locationId: null },
    ]);
    await clearMismatchedClientAssignment(prisma, 'cl1');

    expect(jobOrderFindMany).toHaveBeenCalledWith({
      where: { clientId: 'cl1', consultantId: { not: null } },
      select: { id: true, consultantId: true, locationId: true },
    });
    expect(jobOrderUpdate).toHaveBeenCalledTimes(2);
  });

  it('reports false when the client had no consultant to clear', async () => {
    const { prisma, clientUpdate } = setup({ consultantId: null });
    await expect(clearMismatchedClientAssignment(prisma, 'cl1')).resolves.toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('leaves an assignment the owner still reaches by industry alone', async () => {
    const { prisma, clientUpdate } = setup({ consultantId: 'c1', industryId: 'ind1' });
    (prisma.consultantIndustry.findMany as jest.Mock).mockResolvedValue([{ industryId: 'ind1' }]);
    await expect(clearMismatchedClientAssignment(prisma, 'cl1')).resolves.toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  // The behaviour change: losing the industry no longer strands a record the
  // owner's patch still covers.
  it('leaves an assignment the owner still reaches by location alone', async () => {
    const { prisma, clientUpdate } = setup({ consultantId: 'c1', locationIds: ['sydney'] });
    (prisma.consultantLocation.findMany as jest.Mock).mockResolvedValue([{ locationId: 'au' }]);
    (prisma.location.count as jest.Mock).mockResolvedValue(1);
    await expect(clearMismatchedClientAssignment(prisma, 'cl1')).resolves.toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('reports false for a client that no longer exists', async () => {
    const { prisma, clientUpdate } = setup(null);
    await expect(clearMismatchedClientAssignment(prisma, 'cl1')).resolves.toBe(false);
    expect(clientUpdate).not.toHaveBeenCalled();
  });
});

describe('clearMismatchedCandidateAssignment', () => {
  function setup(candidate: { consultantId: string | null } | null) {
    const update = jest.fn().mockResolvedValue({});
    const prisma = makeGrantedPrisma(
      {},
      {
        candidate: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              candidate && { consultantId: candidate.consultantId, industryId: 'ind1', locationId: 'sydney' },
            ),
          update,
        },
      },
    );
    return { prisma, update };
  }

  it('clears a now-uncovered assignment and reports it', async () => {
    const { prisma, update } = setup({ consultantId: 'c1' });
    await expect(clearMismatchedCandidateAssignment(prisma, 'cd1')).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: 'cd1' }, data: { consultantId: null } });
  });

  it('leaves an unassigned candidate alone', async () => {
    const { prisma, update } = setup({ consultantId: null });
    await expect(clearMismatchedCandidateAssignment(prisma, 'cd1')).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves an assignment the owner still covers', async () => {
    const { prisma, update } = setup({ consultantId: 'c1' });
    (prisma.consultantIndustry.findMany as jest.Mock).mockResolvedValue([{ industryId: 'ind1' }]);
    await expect(clearMismatchedCandidateAssignment(prisma, 'cd1')).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

// The other direction: the consultant's own grants changed, so everything they
// hold that neither arm still reaches gets released.
describe('clearUncoveredConsultantAssignments', () => {
  function setup(grants: { industryIds?: string[]; locationIds?: string[] } = {}) {
    const clientUpdate = jest.fn().mockResolvedValue({});
    const candidateUpdate = jest.fn().mockResolvedValue({});
    const jobOrderUpdate = jest.fn().mockResolvedValue({});
    const prisma = makeGrantedPrisma(grants, {
      client: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cl1', industryId: 'ind1', locations: [{ locationId: 'sydney' }] }]),
        update: clientUpdate,
      },
      candidate: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cd1', industryId: 'ind1', locationId: 'sydney' }]),
        update: candidateUpdate,
      },
      jobOrder: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'jo1', locationId: 'sydney', client: { industryId: 'ind1' } }]),
        update: jobOrderUpdate,
      },
    });
    return { prisma, clientUpdate, candidateUpdate, jobOrderUpdate };
  }

  it('releases every record neither arm still reaches', async () => {
    const { prisma, clientUpdate, candidateUpdate, jobOrderUpdate } = setup({ industryIds: ['ind2'] });
    await clearUncoveredConsultantAssignments(prisma, 'c1');

    expect(clientUpdate).toHaveBeenCalledWith({ where: { id: 'cl1' }, data: { consultantId: null } });
    expect(candidateUpdate).toHaveBeenCalledWith({ where: { id: 'cd1' }, data: { consultantId: null } });
    expect(jobOrderUpdate).toHaveBeenCalledWith({ where: { id: 'jo1' }, data: { consultantId: null } });
  });

  it('keeps everything the surviving industry grant still covers', async () => {
    const { prisma, clientUpdate, candidateUpdate, jobOrderUpdate } = setup({ industryIds: ['ind1'] });
    await clearUncoveredConsultantAssignments(prisma, 'c1');

    expect(clientUpdate).not.toHaveBeenCalled();
    expect(candidateUpdate).not.toHaveBeenCalled();
    expect(jobOrderUpdate).not.toHaveBeenCalled();
  });

  // Dropping an industry must not strand a record the location arm still holds.
  it('keeps everything the surviving location grant still covers', async () => {
    const { prisma, clientUpdate, candidateUpdate, jobOrderUpdate } = setup({ locationIds: ['au'] });
    (prisma.location.count as jest.Mock).mockResolvedValue(1);
    await clearUncoveredConsultantAssignments(prisma, 'c1');

    expect(clientUpdate).not.toHaveBeenCalled();
    expect(candidateUpdate).not.toHaveBeenCalled();
    expect(jobOrderUpdate).not.toHaveBeenCalled();
  });

  it('scopes every lookup to this consultant', async () => {
    const { prisma } = setup({ industryIds: ['ind1'] });
    await clearUncoveredConsultantAssignments(prisma, 'c1');

    for (const model of ['client', 'candidate', 'jobOrder'] as const) {
      expect((prisma[model].findMany as jest.Mock).mock.calls[0][0].where).toEqual({ consultantId: 'c1' });
    }
  });
});
