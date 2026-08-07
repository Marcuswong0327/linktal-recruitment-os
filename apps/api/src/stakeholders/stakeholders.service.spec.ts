import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StakeholdersService } from './stakeholders.service';
import { CreateStakeholderDto } from './dto/create-stakeholder.dto';
import { QueryStakeholdersDto, SortOrder } from './dto/query-stakeholders.dto';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    consultantId: 'me',
    azureId: 'azure-1',
    email: 'me@example.com',
    fullName: 'Me',
    roleName: 'admin',
    isActive: true,
    permissions: new Set(),
    industryIds: [],
    specializationIds: [],
    locationIds: [],
    ...overrides,
  };
}

function baseQuery(overrides: Partial<QueryStakeholdersDto> = {}): QueryStakeholdersDto {
  return { page: 1, pageSize: 20, sortOrder: SortOrder.asc, ...overrides } as QueryStakeholdersDto;
}

/** The relation keys STAKEHOLDER_INCLUDE pulls in — `toEntity` destructures all of them. */
function withRelations(row: Record<string, unknown> = {}) {
  return {
    client: null,
    jobTitle: null,
    stakeholderRoleType: null,
    coverage: [],
    contactHistory: [],
    ...row,
  };
}

/** A client as STAKEHOLDER_INCLUDE now pulls it through — everything the (fully
 * inherited) job-scope check reads. `locations` entries are `{ location: { ancestorIds } }`. */
function clientRelation(overrides: Record<string, unknown> = {}) {
  return { companyName: 'Acme', industryId: 'ind1', consultantId: null, locations: [], ...overrides };
}

/**
 * Base client stub: the StakeholderRoleType catalog upsert, plus the JobTitle
 * *read* the keyword classifier needs (titles arrive as ids, classification
 * reads words). Nothing here creates a JobTitle — that goes through
 * /job-titles.
 */
function makeBase(roleTypeId = 'rt1', roleTypeName = 'HR', jobTitleName: string | null = 'Head of HR') {
  const roleTypeUpsert = jest.fn().mockResolvedValue({ id: roleTypeId, name: roleTypeName });
  const jobTitleFindUnique = jest
    .fn()
    .mockResolvedValue(jobTitleName === null ? null : { name: jobTitleName });
  return {
    base: {
      stakeholderRoleType: { upsert: roleTypeUpsert },
      jobTitle: { findUnique: jobTitleFindUnique },
    } as unknown as PrismaService,
    roleTypeUpsert,
    jobTitleFindUnique,
  };
}

describe('StakeholdersService.create', () => {
  it('creates without setting displayId (DB sequence owns it), auto-classifies roleType from jobTitle, and returns the row', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({
        id: 's1',
        displayId: 'Stake-0133',
        firstName: 'Jane',
        lastName: 'Doe',
        client: { companyName: 'Acme Corp', industryId: 'ind1' },
        jobTitle: { name: 'Head of HR' },
        stakeholderRoleType: { name: 'HR' },
      }),
    );
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, roleTypeUpsert } = makeBase();
    const service = new StakeholdersService(prisma, base);

    const dto: CreateStakeholderDto = {
      clientId: 'cl1',
      firstName: 'Jane',
      lastName: 'Doe',
      jobTitleId: 'jt-1',
    };
    const result = await service.create(dto, makeUser());

    expect(roleTypeUpsert).toHaveBeenCalledWith({
      where: { name: 'HR' },
      create: { name: 'HR' },
      update: {},
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(create.mock.calls[0][0].data.stakeholderRoleTypeId).toBe('rt1');
    expect(result).toEqual({
      id: 's1',
      displayId: 'Stake-0133',
      firstName: 'Jane',
      lastName: 'Doe',
      companyName: 'Acme Corp',
      jobTitle: 'Head of HR',
      roleType: 'HR',
      coverage: [],
      coverageLocationIds: [],
      lastContactType: null,
      lastContactCategory: null,
      lastContactNotes: null,
      lastContactedBy: null,
    });
  });

  // The catalog is read, never grown here — a title new to the catalog is
  // created through /job-titles first.
  it('passes the jobTitleId through and only reads the catalog to classify', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, jobTitleFindUnique } = makeBase('rt1', 'HR', 'Head of Talent');
    const service = new StakeholdersService(prisma, base);

    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1' }, makeUser());

    expect(jobTitleFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'jt-1' } }),
    );
    expect(create.mock.calls[0][0].data.jobTitleId).toBe('jt-1');
    expect(create.mock.calls[0][0].data).not.toHaveProperty('jobTitle');
  });

  // Classification reads the catalog row's words, so an unset title (or one
  // whose row has vanished) falls back to "Other" rather than throwing.
  it('classifies an unset job title as Other', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, roleTypeUpsert, jobTitleFindUnique } = makeBase('rt-other', 'Other');
    const service = new StakeholdersService(prisma, base);

    await service.create({ clientId: 'cl1' }, makeUser());

    expect(jobTitleFindUnique).not.toHaveBeenCalled();
    expect(roleTypeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Other' } }),
    );
    expect(create.mock.calls[0][0].data.stakeholderRoleTypeId).toBe('rt-other');
  });

  it('leaves the role type untouched when the caller explicitly sets it', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const { base, roleTypeUpsert } = makeBase();
    const service = new StakeholdersService(prisma, base);

    await service.create({ clientId: 'cl1', jobTitleId: 'jt-1', roleTypeId: 'rt-finance' }, makeUser());

    expect(roleTypeUpsert).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].data.stakeholderRoleTypeId).toBe('rt-finance');
  });

  it('nests coverageLocationIds as a create on the join relation', async () => {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const prisma = { stakeholder: { create } } as unknown as ExtendedPrismaClient;
    const service = new StakeholdersService(prisma, makeBase().base);

    await service.create({ clientId: 'cl1', coverageLocationIds: ['syd', 'mel'] }, makeUser());

    expect(create.mock.calls[0][0].data.coverage).toEqual({
      create: [{ locationId: 'syd' }, { locationId: 'mel' }],
    });
  });
});

// A scoped consultant must not be able to attach a contact to a company they
// can't reach — the row would be written into someone else's book and vanish
// from the author's own list. This is now just "can the caller see the
// client" — coverage has no bearing on it (see stakeholderScope in
// common/scope.ts, which now delegates entirely to clientScope).
describe('StakeholdersService.create — destination scope', () => {
  function setup(client: Record<string, unknown> | null) {
    const create = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const clientFindUnique = jest.fn().mockResolvedValue(client);
    const prisma = {
      stakeholder: { create },
      client: { findUnique: clientFindUnique },
    } as unknown as ExtendedPrismaClient;
    return {
      service: new StakeholdersService(prisma, makeBase().base),
      create,
      clientFindUnique,
    };
  }

  const scoped = (overrides: Partial<AuthUser> = {}) =>
    makeUser({ roleName: 'consultant', industryIds: ['ind1'], ...overrides });

  it('rejects a company outside the patch', async () => {
    const { service, create } = setup(clientRelation({ industryId: 'other' }));
    await expect(service.create({ clientId: 'cl1' }, scoped())).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('allows it when the client industry matches', async () => {
    const { service, create } = setup(clientRelation({ industryId: 'ind1' }));
    await service.create({ clientId: 'cl1' }, scoped());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("allows it when the client's own location matches, even out of industry", async () => {
    const { service, create } = setup(
      clientRelation({ industryId: 'other', locations: [{ location: { ancestorIds: ['syd', 'nsw', 'au'] } }] }),
    );
    await service.create({ clientId: 'cl1' }, scoped({ locationIds: ['nsw'] }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  // The old asymmetry is gone: a contact's own coverage no longer rescues an
  // out-of-scope client the way it used to.
  it("no longer lets the contact's own coverage rescue an out-of-scope client", async () => {
    const { service, create } = setup(clientRelation({ industryId: 'other' }));
    await expect(
      service.create(
        { clientId: 'cl1', coverageLocationIds: ['syd'] },
        scoped({ locationIds: ['nsw'] }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('allows it when the caller already owns the client, regardless of grants', async () => {
    const { service, create } = setup(clientRelation({ industryId: 'other', consultantId: 'me' }));
    await service.create({ clientId: 'cl1' }, scoped({ industryIds: [] }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('404s on a client that does not exist', async () => {
    const { service } = setup(null);
    await expect(service.create({ clientId: 'nope' }, scoped())).rejects.toThrow(NotFoundException);
  });

  it('runs no extra queries for an unscoped role', async () => {
    const { service, clientFindUnique } = setup(clientRelation({ industryId: 'other' }));
    await service.create({ clientId: 'cl1' }, makeUser({ roleName: 'manager' }));
    expect(clientFindUnique).not.toHaveBeenCalled();
  });
});

describe('StakeholdersService.update — re-parenting', () => {
  function setup() {
    const findUnique = jest.fn().mockResolvedValue(
      withRelations({ id: 's1', client: clientRelation({ industryId: 'ind1' }) }),
    );
    const update = jest.fn().mockResolvedValue(withRelations({ id: 's1' }));
    const clientFindUnique = jest.fn().mockResolvedValue(clientRelation({ industryId: 'other' }));
    const prisma = {
      stakeholder: { findUnique, update },
      client: { findUnique: clientFindUnique },
    } as unknown as ExtendedPrismaClient;
    return {
      service: new StakeholdersService(prisma, makeBase().base),
      update,
      clientFindUnique,
    };
  }

  it('checks the destination company when clientId changes', async () => {
    const { service, update } = setup();
    await expect(
      service.update('s1', { clientId: 'cl2' }, makeUser({ roleName: 'consultant', industryIds: ['ind1'] })),
    ).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  // Deliberate: correcting a contact's territory is note-keeping, even when the
  // correction moves them out of the author's own patch — and coverage no
  // longer factors into the destination check either way.
  it('does not re-check a coverage-only edit', async () => {
    const { service, clientFindUnique, update } = setup();
    await service.update(
      's1',
      { coverageLocationIds: ['bne'] },
      makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
    );
    expect(clientFindUnique).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

// A stakeholder is now visible exactly when its client is — stakeholderScope
// is `{ client: clientScope(user) }`, full stop. No separate coverage arm.
describe('StakeholdersService.findAll — scope', () => {
  function setup() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { stakeholder: { findMany, count } } as unknown as ExtendedPrismaClient;
    const service = new StakeholdersService(prisma, makeBase().base);
    return { findMany, service };
  }

  it("ANDs the scope with the free-text search instead of clobbering it", async () => {
    const { findMany, service } = setup();
    await service.findAll(
      baseQuery({ q: 'jane' }),
      makeUser({
        roleName: 'consultant',
        consultantId: 'me',
        industryIds: ['ind1'],
        locationIds: ['nsw'],
      }),
    );
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      { OR: expect.any(Array) },
      {
        client: {
          OR: [
            { consultantId: 'me' },
            { industryId: { in: ['ind1'] } },
            { locations: { some: { location: { ancestorIds: { hasSome: ['nsw'] } } } } },
          ],
        },
      },
    ]);
  });

  // Zero grants collapses to the ownership arm alone (via the client), not to
  // match-nothing — a consultant with no grants who directly owns a client
  // still sees its stakeholders, same as they'd see the client itself.
  it('falls back to the client owner’s own book for a consultant with no grants at all', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'consultant', consultantId: 'me' }));
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ client: { consultantId: 'me' } });
  });

  it('does not scope non-consultant roles', async () => {
    const { findMany, service } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'manager' }));
    expect(findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe('StakeholdersService.findOne — job scope', () => {
  function makeService(stakeholder: unknown) {
    const findUnique = jest.fn().mockResolvedValue(stakeholder);
    const prisma = { stakeholder: { findUnique } } as unknown as ExtendedPrismaClient;
    return { service: new StakeholdersService(prisma, makeBase().base) };
  }

  it('rejects a scoped consultant when neither arm matches', async () => {
    const { service } = makeService(
      withRelations({
        id: 's1',
        client: clientRelation({
          industryId: 'finance',
          locations: [{ location: { ancestorIds: ['perth', 'wa', 'au'] } }],
        }),
      }),
    );
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  it("allows a scoped consultant on the parent Client's industry alone", async () => {
    const { service } = makeService(
      withRelations({ id: 's1', client: clientRelation({ industryId: 'tech' }) }),
    );
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'] })),
    ).resolves.toMatchObject({ id: 's1' });
  });

  it("allows a scoped consultant on the parent Client's own location alone", async () => {
    const { service } = makeService(
      withRelations({
        id: 's1',
        client: clientRelation({
          industryId: 'finance',
          locations: [{ location: { ancestorIds: ['sydney', 'nsw', 'au'] } }],
        }),
      }),
    );
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).resolves.toMatchObject({ id: 's1' });
  });

  // A stakeholder's own coverage no longer factors into its own visibility at
  // all — only the client's industry/location/ownership do.
  it("no longer lets the stakeholder's own coverage rescue an out-of-scope client", async () => {
    const { service } = makeService(
      withRelations({
        id: 's1',
        client: clientRelation({
          industryId: 'finance',
          locations: [{ location: { ancestorIds: ['brisbane', 'qld', 'au'] } }],
        }),
        coverage: [{ locationId: 'sydney', location: { name: 'Sydney', ancestorIds: ['sydney', 'nsw', 'au'] } }],
      }),
    );
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', industryIds: ['tech'], locationIds: ['nsw'] })),
    ).rejects.toMatchObject({ response: { code: 'OUT_OF_JOB_SCOPE' } });
  });

  // A consultant with zero grants who directly owns the client can now see
  // its stakeholders too — the ownership arm reaches through the client,
  // where before Stakeholder had no ownership arm to fall back to at all.
  it('allows a scoped consultant with no grants through the client’s own ownership', async () => {
    const { service } = makeService(
      withRelations({
        id: 's1',
        client: clientRelation({ industryId: 'finance', consultantId: 'me' }),
      }),
    );
    await expect(
      service.findOne('s1', makeUser({ roleName: 'consultant', consultantId: 'me' })),
    ).resolves.toMatchObject({ id: 's1' });
  });

  it('never restricts non-consultant roles', async () => {
    const { service } = makeService(
      withRelations({ id: 's1', client: clientRelation({ industryId: 'finance' }) }),
    );
    await expect(
      service.findOne('s1', makeUser({ roleName: 'admin' })),
    ).resolves.toMatchObject({ id: 's1' });
  });
});
