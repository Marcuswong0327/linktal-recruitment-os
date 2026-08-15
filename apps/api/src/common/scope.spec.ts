import { candidateScope, clientScope, isScoped, jobOrderScope, jobResearchScope, stakeholderScope, tobScope } from './scope';
import { AuthUser } from '../auth/auth.types';

/**
 * Direct tests for the row-level visibility resolver.
 *
 * Every service spec exercises scoping incidentally, through whichever arm that
 * entity happens to use. This file tests the resolver itself — the composition
 * of the arms. It's the security boundary, so the assertions are on the exact
 * `where` shape handed to Prisma rather than on "did it filter something".
 *
 * The rule, from CLAUDE.md:
 *
 *     visible = (industry match AND specialization match) OR (location match)
 *
 * This is a pure LIST FILTER now — there is no 403 gate on direct access, and
 * no per-record `consultantId` ownership on Client/Candidate. The one
 * deliberate way to reach an out-of-scope Client/Candidate is a third arm:
 * being on the `consultants` list of a JobOrder that reaches them.
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

describe('isScoped', () => {
  it('scopes the consultant role and nothing else', () => {
    expect(isScoped(makeUser({ roleName: 'consultant' }))).toBe(true);
    for (const roleName of ['admin', 'manager', 'finance', 'researcher', 'viewer']) {
      expect(isScoped(makeUser({ roleName }))).toBe(false);
    }
  });
});

// Zero grants must never resolve to "everything". There's no ownership arm to
// fall back to anymore, so an empty-grants consultant relies on Prisma/
// Postgres's own semantics: `{ in: [] }` and `{ hasSome: [] }` both evaluate
// to "matches nothing" — no special-cased short-circuit is needed in code.
describe('an empty-grants consultant', () => {
  it('emits an industry arm that can never match', () => {
    const user = makeUser({ industryIds: [], locationIds: [] });
    const arms = clientScope(user).OR as Record<string, unknown>[];
    expect(arms[0]).toEqual({ industryId: { in: [] } });
  });

  it('emits a location arm that can never match', () => {
    const user = makeUser({ industryIds: [], locationIds: [] });
    const arms = clientScope(user).OR as Record<string, unknown>[];
    expect(arms[1]).toEqual({ locations: { some: { location: { ancestorIds: { hasSome: [] } } } } });
  });

  it('still carries the job-order-membership arm — that one never depends on grants', () => {
    const user = makeUser({ industryIds: [], locationIds: [] });
    const arms = clientScope(user).OR as Record<string, unknown>[];
    expect(arms[2]).toEqual({
      jobOrders: { some: { deletedAt: null, consultants: { some: { consultantId: 'me' } } } },
    });
  });
});

describe('clientScope', () => {
  it('has three arms: industry, own market, and job-order membership', () => {
    const scope = clientScope(makeUser());
    expect(scope.OR).toEqual([
      { industryId: { in: ['ind1'] } },
      { locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
      { jobOrders: { some: { deletedAt: null, consultants: { some: { consultantId: 'me' } } } } },
    ]);
  });
});

describe('tobScope', () => {
  // A TOB carries no scope fields of its own, so it delegates wholesale rather
  // than restating the arms — which is what keeps clientScope's arms from
  // drifting out of sync here.
  it('is exactly clientScope, nested under the client relation', () => {
    const user = makeUser();
    expect(tobScope(user)).toEqual({ client: clientScope(user) });
  });
});

describe('stakeholderScope', () => {
  it('is exactly clientScope, nested under the client relation — same as tobScope', () => {
    const user = makeUser();
    expect(stakeholderScope(user)).toEqual({ client: clientScope(user) });
  });
});

describe('candidateScope', () => {
  it('has three arms: industry, own location, and reach via a job order submission', () => {
    const scope = candidateScope(makeUser());
    expect(scope.OR).toEqual([
      { industryId: { in: ['ind1'] } },
      { location: { ancestorIds: { hasSome: ['nsw'] } } },
      {
        submissions: {
          some: { deletedAt: null, jobOrder: { consultants: { some: { consultantId: 'me' } } } },
        },
      },
    ]);
  });
});

describe('jobOrderScope', () => {
  it('has three arms: industry via client, own location, and direct membership', () => {
    const scope = jobOrderScope(makeUser());
    expect(scope.OR).toEqual([
      { client: { industryId: { in: ['ind1'] } } },
      { location: { ancestorIds: { hasSome: ['nsw'] } } },
      { consultants: { some: { consultantId: 'me' } } },
    ]);
  });
});

describe('jobResearchScope', () => {
  // Research carries no job-order-membership arm — ClientJobResearch.consultantId
  // ("who conducted this research") is descriptive metadata only, same
  // treatment Stakeholder.coverage already got.
  it('has exactly two arms: industry via client, and own location', () => {
    const scope = jobResearchScope(makeUser());
    expect(scope.OR).toEqual([
      { client: { industryId: { in: ['ind1'] } } },
      { location: { ancestorIds: { hasSome: ['nsw'] } } },
    ]);
    expect((scope.OR as unknown[]).length).toBe(2);
  });
});

describe('where each entity reaches its location from', () => {
  // A grant covers the granted node plus every descendant, matched through the
  // denormalized ancestorIds column — never by expanding the grant downward,
  // which for one COUNTRY:Australia grant would mean 1,500+ nodes.
  it('matches descendants via ancestorIds rather than expanding the grant', () => {
    const scope = candidateScope(makeUser({ locationIds: ['au', 'my'] }));
    expect((scope.OR as unknown[])[1]).toEqual({
      location: { ancestorIds: { hasSome: ['au', 'my'] } },
    });
  });
});

describe('the specialization narrowing', () => {
  // Holding no specializations means "the whole industry", not "nothing" —
  // otherwise switching the arm on would empty every consultant's list.
  it('leaves the industry arm unnarrowed when the consultant holds none', () => {
    expect((candidateScope(makeUser({ specializationIds: [] })).OR as unknown[])[0]).toEqual({
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
    const arm = (candidateScope(makeUser({ specializationIds: ['spec1'] })).OR as Record<string, never>[])[0];
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
    expect(arms[0].client.OR).toHaveLength(2);
  });
});
