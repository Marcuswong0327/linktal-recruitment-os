import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { TobsService } from './tobs.service';
import { CreateTobDto } from './dto/create-tob.dto';
import { QueryTobsDto, SortOrder, TobSortField } from './dto/query-tobs.dto';
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

function baseQuery(overrides: Partial<QueryTobsDto> = {}): QueryTobsDto {
  return { page: 1, pageSize: 20, sortOrder: SortOrder.asc, ...overrides } as QueryTobsDto;
}

/** The client shape TOB_INCLUDE pulls through — everything the scope check reads. */
function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    companyName: 'Acme Corp',
    industryId: 'ind1',
    consultantId: null,
    locations: [],
    stakeholders: [],
    ...overrides,
  };
}

/** The relation keys TOB_INCLUDE pulls in — `toEntity` destructures both. */
function withRelations(row: Record<string, unknown> = {}) {
  return { client: makeClient(), linktalRepresentative: null, ...row };
}

describe('TobsService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and resolves the FK names', async () => {
    const create = jest.fn().mockResolvedValue(
      withRelations({
        id: 't1',
        displayId: 'TOB-0007',
        clientId: 'cl1',
        fileName: 'Acme TOB 2024 signed.pdf',
        pricing: '13%-(80k below)15%-18%',
        guaranteePeriod: 180,
        linktalRepresentative: { fullName: 'Sam Consultant' },
      }),
    );
    const prisma = { tob: { create } } as unknown as ExtendedPrismaClient;
    const service = new TobsService(prisma, {} as PrismaService);

    const dto: CreateTobDto = {
      clientId: 'cl1',
      fileName: 'Acme TOB 2024 signed.pdf',
      pricing: '13%-(80k below)15%-18%',
      guaranteePeriod: 180,
    };
    const result = await service.create(dto, makeUser());

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toEqual({
      id: 't1',
      displayId: 'TOB-0007',
      clientId: 'cl1',
      fileName: 'Acme TOB 2024 signed.pdf',
      pricing: '13%-(80k below)15%-18%',
      guaranteePeriod: 180,
      companyName: 'Acme Corp',
      linktalRepresentative: 'Sam Consultant',
    });
  });

  // A TOB has no scope fields of its own, so "can I file this?" is entirely a
  // question about the destination client.
  it('rejects a scoped consultant filing against a client outside their patch', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeClient({ industryId: 'other' }));
    const create = jest.fn();
    const prisma = { client: { findUnique }, tob: { create } } as unknown as ExtendedPrismaClient;
    const service = new TobsService(prisma, {} as PrismaService);

    await expect(
      service.create({ clientId: 'cl1' }, makeUser({ roleName: 'consultant', industryIds: ['ind1'] })),
    ).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('allows a scoped consultant to file against a client they own, whatever their grants say', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue(makeClient({ industryId: 'other', consultantId: 'me' }));
    const create = jest.fn().mockResolvedValue(withRelations({ id: 't1', clientId: 'cl1' }));
    const prisma = { client: { findUnique }, tob: { create } } as unknown as ExtendedPrismaClient;
    const service = new TobsService(prisma, {} as PrismaService);

    await service.create({ clientId: 'cl1' }, makeUser({ roleName: 'consultant', industryIds: [] }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not query the client at all for an unscoped role', async () => {
    const findUnique = jest.fn();
    const create = jest.fn().mockResolvedValue(withRelations({ id: 't1' }));
    const prisma = { client: { findUnique }, tob: { create } } as unknown as ExtendedPrismaClient;
    const service = new TobsService(prisma, {} as PrismaService);

    await service.create({ clientId: 'cl1' }, makeUser({ roleName: 'manager' }));
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('TobsService.findAll', () => {
  function setup(rows: Record<string, unknown>[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows.map((r) => withRelations(r)));
    const count = jest.fn().mockResolvedValue(rows.length);
    const prisma = { tob: { findMany, count } } as unknown as ExtendedPrismaClient;
    return { service: new TobsService(prisma, {} as PrismaService), findMany, count };
  }

  it('paginates and defaults to most recently created', async () => {
    const { service, findMany } = setup([{ id: 't1' }]);
    const result = await service.findAll(baseQuery({ page: 2, pageSize: 5 }), makeUser());

    expect(findMany.mock.calls[0][0]).toMatchObject({
      skip: 5,
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 5, pageCount: 1 });
  });

  // Most historical rows carry no guarantee term — those belong at the bottom
  // of a "longest guarantee" sort, not the top (Postgres's default on desc).
  it('sorts guaranteePeriod with nulls last in both directions', async () => {
    const { service, findMany } = setup();
    await service.findAll(
      baseQuery({ sortBy: TobSortField.guaranteePeriod, sortOrder: SortOrder.desc }),
      makeUser(),
    );
    expect(findMany.mock.calls[0][0].orderBy).toEqual({
      guaranteePeriod: { sort: 'desc', nulls: 'last' },
    });
  });

  it('filters by client, by a set of clients, and by the signing consultant', async () => {
    const { service, findMany } = setup();
    await service.findAll(baseQuery({ clientId: 'cl1', linktalRepresentativeId: 'c9' }), makeUser());
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      clientId: 'cl1',
      linktalRepresentativeId: 'c9',
    });

    await service.findAll(baseQuery({ clientIds: ['cl1', 'cl2'] }), makeUser());
    expect(findMany.mock.calls[1][0].where.clientId).toEqual({ in: ['cl1', 'cl2'] });
  });

  // The search OR and the scope OR must combine, not clobber each other — a
  // second top-level `where.OR` assignment would silently drop the first.
  it('AND-s the free-text search together with the scope filter', async () => {
    const { service, findMany } = setup();
    await service.findAll(
      baseQuery({ q: 'acme' }),
      makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
    );

    const and = findMany.mock.calls[0][0].where.AND;
    expect(and).toHaveLength(2);
    expect(and[0].OR.map((c: Record<string, unknown>) => Object.keys(c)[0])).toEqual([
      'displayId',
      'fileName',
      'clientTobRepresentative',
      'invoiceContactName',
      'invoiceContactEmail',
    ]);
    // Scope reaches a TOB only through its parent company.
    expect(and[1]).toHaveProperty('client');
  });

  it('applies no scope filter for an unscoped role', async () => {
    const { service, findMany } = setup();
    await service.findAll(baseQuery(), makeUser({ roleName: 'finance' }));
    expect(findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });
});

describe('TobsService.findOne', () => {
  function setup(client: Record<string, unknown> | null) {
    const findUnique = jest.fn().mockResolvedValue(
      client === null ? null : withRelations({ id: 't1', client }),
    );
    const prisma = { tob: { findUnique } } as unknown as ExtendedPrismaClient;
    return { service: new TobsService(prisma, {} as PrismaService), findUnique };
  }

  it('404s when the row does not exist', async () => {
    const { service } = setup(null);
    await expect(service.findOne('nope', makeUser())).rejects.toThrow(NotFoundException);
  });

  it('403s a scoped consultant whose patch does not reach the parent client', async () => {
    const { service } = setup(makeClient({ industryId: 'other' }));
    await expect(
      service.findOne('t1', makeUser({ roleName: 'consultant', industryIds: ['ind1'] })),
    ).rejects.toThrow(ForbiddenException);
  });

  // Same four arms as ClientsService.findOne — including the one that reaches a
  // company through a contact's own coverage rather than the company's market.
  it('lets a stakeholder’s coverage carry the client, and the TOB with it', async () => {
    const { service } = setup(
      makeClient({
        industryId: 'other',
        stakeholders: [{ coverage: [{ location: { ancestorIds: ['syd', 'nsw', 'au'] } }] }],
      }),
    );
    const result = await service.findOne(
      't1',
      makeUser({ roleName: 'consultant', industryIds: ['ind1'], locationIds: ['nsw'] }),
    );
    expect(result).toMatchObject({ id: 't1', companyName: 'Acme Corp' });
  });

  it('never leaks the scope-only client fields into the response', async () => {
    const { service } = setup(makeClient());
    const result = await service.findOne('t1', makeUser());
    expect(result).not.toHaveProperty('client');
    expect(result).not.toHaveProperty('industryId');
    expect(result).not.toHaveProperty('consultantId');
  });
});

describe('TobsService.update', () => {
  it('checks the destination client too, so a row cannot be pushed out of reach', async () => {
    const tobFindUnique = jest.fn().mockResolvedValue(withRelations({ id: 't1', clientId: 'cl1' }));
    const clientFindUnique = jest.fn().mockResolvedValue(makeClient({ industryId: 'other' }));
    const update = jest.fn();
    const prisma = {
      tob: { findUnique: tobFindUnique, update },
      client: { findUnique: clientFindUnique },
    } as unknown as ExtendedPrismaClient;
    const service = new TobsService(prisma, {} as PrismaService);

    await expect(
      service.update(
        't1',
        { clientId: 'cl2' },
        makeUser({ roleName: 'consultant', industryIds: ['ind1'] }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('skips the destination check when clientId is not being changed', async () => {
    const tobFindUnique = jest.fn().mockResolvedValue(withRelations({ id: 't1' }));
    const clientFindUnique = jest.fn();
    const update = jest.fn().mockResolvedValue(withRelations({ id: 't1', paymentTerm: '45 days' }));
    const prisma = {
      tob: { findUnique: tobFindUnique, update },
      client: { findUnique: clientFindUnique },
    } as unknown as ExtendedPrismaClient;
    const service = new TobsService(prisma, {} as PrismaService);

    await service.update('t1', { paymentTerm: '45 days' }, makeUser());
    expect(clientFindUnique).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toEqual({ paymentTerm: '45 days' });
  });
});

describe('TobsService.remove / restore / purge', () => {
  it('soft-deletes through the extended client, cascading to nothing', async () => {
    const findUnique = jest.fn().mockResolvedValue(withRelations({ id: 't1' }));
    const del = jest.fn().mockResolvedValue({ id: 't1' });
    const prisma = { tob: { findUnique, delete: del } } as unknown as ExtendedPrismaClient;
    const service = new TobsService(prisma, {} as PrismaService);

    await service.remove('t1', makeUser());
    expect(del).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('rejects restoring a row that is not deleted', async () => {
    const prisma = { tob: { update: jest.fn() } } as unknown as ExtendedPrismaClient;
    const base = {
      tob: { findUnique: jest.fn().mockResolvedValue({ id: 't1', deletedAt: null }) },
    } as unknown as PrismaService;
    const service = new TobsService(prisma, base);

    await expect(service.restore('t1')).rejects.toThrow(BadRequestException);
  });

  it('clears both soft-delete columns on restore', async () => {
    const update = jest.fn().mockResolvedValue(withRelations({ id: 't1' }));
    const prisma = { tob: { update } } as unknown as ExtendedPrismaClient;
    const base = {
      tob: { findUnique: jest.fn().mockResolvedValue({ id: 't1', deletedAt: new Date() }) },
    } as unknown as PrismaService;
    const service = new TobsService(prisma, base);

    await service.restore('t1');
    expect(update.mock.calls[0][0].data).toEqual({ deletedAt: null, deletedById: null });
  });

  // The audit row has to be written before the hard delete: afterwards there's
  // no row left to attribute it to.
  it('writes a HARD_DELETE audit row before erasing, via the base client', async () => {
    const order: string[] = [];
    const auditCreate = jest.fn().mockImplementation(() => {
      order.push('audit');
      return Promise.resolve({});
    });
    const del = jest.fn().mockImplementation(() => {
      order.push('delete');
      return Promise.resolve({ id: 't1' });
    });
    const base = {
      tob: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }), delete: del },
      auditLog: { create: auditCreate },
    } as unknown as PrismaService;
    const service = new TobsService({} as ExtendedPrismaClient, base);

    await service.purge('t1');
    expect(order).toEqual(['audit', 'delete']);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      action: 'HARD_DELETE',
      entityType: 'Tob',
      entityId: 't1',
    });
  });
});
