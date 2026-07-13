import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientStatusFilter, QueryClientsDto, SortOrder } from './dto/query-clients.dto';
import { PrismaService } from '../prisma/prisma.service';

describe('ClientsService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'cl1', displayId: 'Client-0101', companyName: 'Acme Corp' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { client: { create } } as unknown as PrismaService;
    const service = new ClientsService(prisma);

    const dto: CreateClientDto = { companyName: 'Acme Corp' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toBe(created);
  });
});

// Regression coverage for the null-vs-undefined bug: the frontend once sent
// `?? undefined` for cleared fields, which JSON.stringify drops from the
// request body entirely, so a "clear this field" edit silently no-op'd while
// still reporting success. That was a frontend bug, not a service one — this
// pins down the service's side of the contract (it must pass `null` straight
// through, unmangled) so a future refactor here can't reintroduce the same
// class of bug from the other direction.
describe('ClientsService.update', () => {
  function makeService(existing: unknown = { id: 'cl1' }) {
    const findUnique = jest.fn().mockResolvedValue(existing);
    const update = jest.fn().mockResolvedValue({ id: 'cl1' });
    const prisma = { client: { findUnique, update } } as unknown as PrismaService;
    return { service: new ClientsService(prisma), update };
  }

  it('passes null straight through for cleared nullable fields, instead of stripping them', async () => {
    const { service, update } = makeService();
    // Generated type omits null (Prisma/class-validator accept it at
    // runtime) — same gap the frontend casts around.
    const dto = {
      consultantId: null,
      industry: null,
      city: null,
      country: null,
      feePercentage: null,
    } as unknown as UpdateClientDto;

    await service.update('cl1', dto);

    expect(update).toHaveBeenCalledWith({ where: { id: 'cl1' }, data: dto });
    const savedData = update.mock.calls[0][0].data;
    expect(savedData.consultantId).toBeNull();
    expect(savedData.industry).toBeNull();
    expect(savedData.city).toBeNull();
    expect(savedData.country).toBeNull();
    expect(savedData.feePercentage).toBeNull();
  });

  it('throws when the client does not exist', async () => {
    const { service } = makeService(null);
    await expect(service.update('missing', { companyName: 'X' })).rejects.toThrow('Client missing not found');
  });
});

// Regression coverage for the '' (Unassigned) sentinel bug: `findAll` used to
// check `if (query.consultantId)`, which is falsy for '', so filtering by
// "Unassigned" silently returned every client instead of just the unassigned
// ones.
describe('ClientsService.findAll — consultantId filter', () => {
  function makeService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(rows.length);
    const $transaction = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));
    const prisma = { client: { findMany, count }, $transaction } as unknown as PrismaService;
    return { service: new ClientsService(prisma), findMany };
  }

  const baseQuery: QueryClientsDto = {
    page: 1,
    pageSize: 20,
    sortOrder: SortOrder.asc,
    status: ClientStatusFilter.ALL,
  };

  it('does not filter by consultant when consultantId is omitted', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery });
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('consultantId');
  });

  it('maps the "" Unassigned sentinel to a null FK filter, not a no-op', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, consultantId: '' });
    expect(findMany.mock.calls[0][0].where.consultantId).toBeNull();
  });

  it('filters by the given consultant id', async () => {
    const { service, findMany } = makeService();
    await service.findAll({ ...baseQuery, consultantId: 'cons-1' });
    expect(findMany.mock.calls[0][0].where.consultantId).toBe('cons-1');
  });
});
