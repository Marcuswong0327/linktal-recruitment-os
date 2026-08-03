import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocationLevel } from '@prisma/client';
import { LocationsService } from './locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueryLocationsDto } from './dto/query-locations.dto';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    location: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'new-id' }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-id', ...data })),
      ...(overrides.location as object),
    },
  };
}

function query(overrides: Partial<QueryLocationsDto> = {}): QueryLocationsDto {
  return { take: 50, ...overrides } as QueryLocationsDto;
}

describe('LocationsService.findAll', () => {
  it('always caps the read — the tree is thousands of nodes', async () => {
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

    await service.findAll(query({ q: 'syd', level: LocationLevel.CITY }));
    expect(prisma.location.findMany.mock.calls[0][0].where).toEqual({
      name: { contains: 'syd', mode: 'insensitive' },
      level: LocationLevel.CITY,
    });
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

// The rungs are fixed (COUNTRY ▸ STATE ▸ CITY ▸ SUBURB) and `ancestorIds` is
// what the scope resolver reads, so both are enforced on write — a node
// written with a wrong parent or an empty ancestor path would silently drop
// out of every location grant.
describe('LocationsService.create', () => {
  it('maintains ancestorIds as self-first, root-last', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sydney',
          level: 'CITY',
          ancestorIds: ['sydney', 'nsw', 'australia'],
        }),
        create: jest.fn().mockResolvedValue({ id: 'silverwater' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'silverwater', ...data })),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    const result = await service.create({
      name: 'Silverwater',
      level: LocationLevel.SUBURB,
      parentId: 'sydney',
      postcode: '2128',
    });

    expect(result.ancestorIds).toEqual(['silverwater', 'sydney', 'nsw', 'australia']);
    // written blank on insert, then filled — the row's own cuid doesn't exist until it does
    expect(prisma.location.create.mock.calls[0][0].data.ancestorIds).toEqual([]);
  });

  it('rejects a node whose parent is on the wrong rung', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({ id: 'australia', level: 'COUNTRY', ancestorIds: ['australia'] }),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Sydney', level: LocationLevel.CITY, parentId: 'australia' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PARENT_LEVEL' } });
    expect(prisma.location.create).not.toHaveBeenCalled();
  });

  it('requires a parent for anything below COUNTRY', async () => {
    const prisma = makePrisma();
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'New South Wales', level: LocationLevel.STATE }),
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

  it('rejects a postcode on anything but a SUBURB', async () => {
    const prisma = makePrisma({
      location: {
        findUnique: jest.fn().mockResolvedValue({ id: 'nsw', level: 'STATE', ancestorIds: ['nsw', 'australia'] }),
      },
    });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Sydney', level: LocationLevel.CITY, parentId: 'nsw', postcode: '2000' }),
    ).rejects.toMatchObject({ response: { code: 'POSTCODE_NOT_ALLOWED' } });
  });

  it('rejects an unknown parent id', async () => {
    const prisma = makePrisma({ location: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new LocationsService(prisma as unknown as PrismaService);

    await expect(
      service.create({ name: 'Sydney', level: LocationLevel.CITY, parentId: 'ghost' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
