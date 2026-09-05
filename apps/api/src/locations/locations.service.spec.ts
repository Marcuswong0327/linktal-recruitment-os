import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LocationLevel } from '@prisma/client';
import { LocationsService } from './locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueryLocationsDto } from './dto/query-locations.dto';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const location = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'new-id' }),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-id', ...data })),
    delete: jest.fn().mockResolvedValue({ id: 'deleted-id' }),
    count: jest.fn().mockResolvedValue(0),
    ...(overrides.location as object),
  };
  const candidate = { count: jest.fn().mockResolvedValue(0), ...(overrides.candidate as object) };
  const jobOrder = { count: jest.fn().mockResolvedValue(0), ...(overrides.jobOrder as object) };
  const clientJobResearch = { count: jest.fn().mockResolvedValue(0), ...(overrides.clientJobResearch as object) };
  const clientLocation = { count: jest.fn().mockResolvedValue(0), ...(overrides.clientLocation as object) };
  const stakeholderLocation = { count: jest.fn().mockResolvedValue(0), ...(overrides.stakeholderLocation as object) };
  const consultantLocation = { count: jest.fn().mockResolvedValue(0), ...(overrides.consultantLocation as object) };

  const prisma = {
    location,
    candidate,
    jobOrder,
    clientJobResearch,
    clientLocation,
    stakeholderLocation,
    consultantLocation,
  };
  // remove() runs inside $transaction(async tx => ...) — hand the same mocked
  // delegates back as the tx client, matching how Prisma's interactive
  // transactions preserve extension-provided delegates.
  return { ...prisma, $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)) };
}

function query(overrides: Partial<QueryLocationsDto> = {}): QueryLocationsDto {
  return { take: 50, ...overrides } as QueryLocationsDto;
}

describe('LocationsService.findAll', () => {
  it('always caps the read', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await service.findAll(query());
    expect(prisma.location.findMany.mock.calls[0][0].take).toBe(50);
  });

  // parentId is one step down (a cascading picker); underId is the whole
  // subtree at any depth, resolved through the denormalized ancestor path
  // rather than a recursive query.
  it('filters direct children by parentId', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await service.findAll(query({ parentId: 'australia' }));
    expect(prisma.location.findMany.mock.calls[0][0].where).toEqual({ parentId: 'australia' });
  });

  it('filters a whole subtree by underId, via the ancestor path', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await service.findAll(query({ underId: 'australia' }));
    expect(prisma.location.findMany.mock.calls[0][0].where).toEqual({
      ancestorIds: { has: 'australia' },
    });
  });

  it('combines a name search with a level filter', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await service.findAll(query({ q: 'syd', level: LocationLevel.CITY_COVERAGE }));
    // Prefix pass first, then the mid-word remainder — see rankedNameSearch.
    expect(prisma.location.findMany.mock.calls[0][0].where).toEqual({
      name: { startsWith: 'syd', mode: 'insensitive' },
      level: LocationLevel.CITY_COVERAGE,
    });
    expect(prisma.location.findMany.mock.calls[1][0].where).toEqual({
      name: { contains: 'syd', mode: 'insensitive' },
      NOT: { name: { startsWith: 'syd', mode: 'insensitive' } },
      level: LocationLevel.CITY_COVERAGE,
    });
  });

  it('puts prefix matches ahead of mid-word ones', async () => {
    const prisma = makePrisma();
    prisma.location.findMany
      .mockResolvedValueOnce([{ id: '1', name: 'Perth WA' }])
      .mockResolvedValueOnce([{ id: '2', name: 'Greater Perth' }]);
    const service = new LocationsService(prisma as unknown as PrismaService);

    const rows = await service.findAll(query({ q: 'Perth' }));
    expect(rows.map((r: { name: string }) => r.name)).toEqual(['Perth WA', 'Greater Perth']);
  });

  // Level before name, so a mixed-level result reads top-down instead of
  // interleaving rungs alphabetically.
  it('orders by level then name', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await service.findAll(query());
    expect(prisma.location.findMany.mock.calls[0][0].orderBy).toEqual([
      { level: 'asc' },
      { name: 'asc' },
    ]);
  });
});

describe('LocationsService.findOne', () => {
  it('404s on an unknown id', async () => {
    const prisma = makePrisma({ location: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// The tree is two rungs (COUNTRY ▸ CITY_COVERAGE) and `ancestorIds` is what
// the scope resolver reads, so both are enforced on write — a node written
// with a wrong parent or an empty ancestor path would silently drop out of
// every location grant.
describe('LocationsService.create', () => {
  it('maintains ancestorIds as self-first, root-last', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'australia',
          level: 'COUNTRY',
          ancestorIds: ['australia'],
        }),
        create: jest.fn().mockResolvedValue({ id: 'adelaide' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'adelaide', ...data })),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    const result = await service.create({
      name: 'Adelaide SA',
      level: LocationLevel.CITY_COVERAGE,
      parentId: 'australia',
    });

    expect(result.ancestorIds).toEqual(['adelaide', 'australia']);
    // written blank on insert, then filled — the row's own cuid doesn't exist until it does
    expect(prisma.location.create.mock.calls[0][0].data.ancestorIds).toEqual([]);
  });

  it('rejects a node whose parent is on the wrong rung', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sydney', level: 'CITY_COVERAGE', ancestorIds: ['sydney', 'australia'] }),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Nested', level: LocationLevel.CITY_COVERAGE, parentId: 'sydney' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PARENT_LEVEL' } });
    expect(prisma.location.create).not.toHaveBeenCalled();
  });

  it('requires a parent for CITY_COVERAGE', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Adelaide SA', level: LocationLevel.CITY_COVERAGE }),
    ).rejects.toMatchObject({ response: { code: 'PARENT_REQUIRED' } });
  });

  it('rejects a COUNTRY given a parent — it sits at the root', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Australia', level: LocationLevel.COUNTRY, parentId: 'somewhere' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PARENT' } });
  });

  it('creates a COUNTRY with itself as its only ancestor', async () => {
    const prisma = makePrisma({
      location: {
        create: jest.fn().mockResolvedValue({ id: 'newland' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'newland', ...data })),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    const result = await service.create({ name: 'Newland', level: LocationLevel.COUNTRY });
    expect(result.ancestorIds).toEqual(['newland']);
  });

  it('rejects a duplicate country name', async () => {
    const prisma = makePrisma({
      location: { findFirst: jest.fn().mockResolvedValue({ id: 'existing-au' }) },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Australia', level: LocationLevel.COUNTRY }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown parent id', async () => {
    const prisma = makePrisma({ location: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Adelaide SA', level: LocationLevel.CITY_COVERAGE, parentId: 'ghost' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// The 13 seeded rows are isProtected — nobody, including admin, can rename,
// reparent or delete them. Anything admin adds afterwards is fully editable.
describe('LocationsService.update', () => {
  it('rejects any edit to a protected row', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sydney-nsw', name: 'Sydney NSW', level: 'CITY_COVERAGE', isProtected: true }),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(service.update('sydney-nsw', { name: 'New Name' })).rejects.toMatchObject({
      response: { code: 'LOCATION_PROTECTED' },
    });
    expect(prisma.location.update).not.toHaveBeenCalled();
  });

  it('renames an admin-added, unprotected COUNTRY', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sg', name: 'Singapor', level: 'COUNTRY', parentId: null, isProtected: false }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sg', ...data })),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    const result = await service.update('sg', { name: 'Singapore' });
    expect(result.name).toBe('Singapore');
  });

  it('reparents an admin-added CITY_COVERAGE and recomputes ancestorIds', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'penang-town', name: 'Georgetown', level: 'CITY_COVERAGE', parentId: 'malaysia', isProtected: false })
          .mockResolvedValueOnce({ id: 'singapore', level: 'COUNTRY', ancestorIds: ['singapore'] }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'penang-town', ...data })),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    const result = await service.update('penang-town', { parentId: 'singapore' });
    expect(result.ancestorIds).toEqual(['penang-town', 'singapore']);
  });
});

describe('LocationsService.remove', () => {
  it('rejects deleting a protected row', async () => {
    const prisma = makePrisma({
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'au', name: 'Australia', isProtected: true }) },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(service.remove('au')).rejects.toMatchObject({ response: { code: 'LOCATION_PROTECTED' } });
    expect(prisma.location.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting a row that still has children', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sg', name: 'Singapore', isProtected: false }),
        count: jest.fn().mockResolvedValue(2),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(service.remove('sg')).rejects.toMatchObject({ response: { code: 'LOCATION_HAS_CHILDREN' } });
  });

  it('rejects deleting a row still referenced by records, naming the counts', async () => {
    const prisma = makePrisma({
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'adelaide', name: 'Adelaide SA', isProtected: false }) },
      candidate: { count: jest.fn().mockResolvedValue(40) },
      clientLocation: { count: jest.fn().mockResolvedValue(3) },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(service.remove('adelaide')).rejects.toMatchObject({
      response: { code: 'LOCATION_IN_USE', message: expect.stringContaining('40 candidates') },
    });
    expect(prisma.location.delete).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced, unprotected, childless row', async () => {
    const prisma = makePrisma({
      location: { findUnique: jest.fn().mockResolvedValue({ id: 'adelaide', name: 'Adelaide SA', isProtected: false }) },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    const result = await service.remove('adelaide');
    expect(result).toEqual({ id: 'adelaide' });
    expect(prisma.location.delete).toHaveBeenCalledWith({ where: { id: 'adelaide' } });
  });
});
