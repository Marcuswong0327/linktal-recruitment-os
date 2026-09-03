import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { JobOrdersImportService, JOB_ORDER_IMPORT_COLUMNS } from './job-orders-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

const CLIENT = { id: 'client1', displayId: 'CLI-000001' };
const LOCATION = { id: 'loc-syd', name: 'Sydney NSW', ancestorIds: ['loc-syd', 'loc-au'] };
const LOCATION_ANCESTORS = [
  { id: 'loc-au', name: 'Australia', ancestorIds: ['loc-au'] },
  LOCATION,
];
const LOCATION_PATH = 'Sydney NSW';
const EXISTING_JOB_ORDER = { id: 'jo1', displayId: 'JO-000001' };

async function makeJobOrderWorkbook(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Job Orders');
  sheet.addRow(JOB_ORDER_IMPORT_COLUMNS.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(JOB_ORDER_IMPORT_COLUMNS.map((c) => row[c.key] ?? ''));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    clientDisplayId: CLIENT.displayId,
    openings: '1',
    status: 'ACTIVE',
    quality: 'MEDIUM',
    ...overrides,
  };
}

function makeTx() {
  return {
    jobOrder: {
      create: jest.fn().mockResolvedValue({ id: 'new1' }),
      update: jest.fn().mockResolvedValue({ id: EXISTING_JOB_ORDER.id }),
      findUnique: jest.fn().mockResolvedValue({ id: EXISTING_JOB_ORDER.id, openings: 1 }),
    },
    jobTitle: {
      upsert: jest.fn().mockResolvedValue({ id: 'jt1', name: 'Production Manager' }),
    },
    jobRoleType: {
      upsert: jest.fn().mockResolvedValue({ id: 'jrt1', name: 'Electrician' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeServices(opts: {
  clients?: { id: string; displayId: string }[];
  locations?: { id: string; name: string; ancestorIds: string[] }[];
  jobTitles?: { name: string }[];
  jobRoleTypes?: { name: string }[];
  existingJobOrders?: { id: string; displayId: string }[];
} = {}) {
  const tx = makeTx();
  const base = {
    location: { findMany: jest.fn().mockResolvedValue(opts.locations ?? LOCATION_ANCESTORS) },
    jobTitle: { findMany: jest.fn().mockResolvedValue(opts.jobTitles ?? []) },
    jobRoleType: { findMany: jest.fn().mockResolvedValue(opts.jobRoleTypes ?? []) },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };
  const prisma = {
    client: { findMany: jest.fn().mockResolvedValue(opts.clients ?? [CLIENT]) },
    jobOrder: { findMany: jest.fn().mockResolvedValue(opts.existingJobOrders ?? [EXISTING_JOB_ORDER]) },
  };
  const service = new JobOrdersImportService(
    prisma as unknown as ExtendedPrismaClient,
    base as unknown as PrismaService,
  );
  return { service, base, prisma, tx };
}

describe('JobOrdersImportService.validate', () => {
  it('rejects the whole file when two rows share a non-blank Display ID', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([
      validRow({ displayId: EXISTING_JOB_ORDER.displayId }),
      validRow({ displayId: EXISTING_JOB_ORDER.displayId }),
    ]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors.filter((e) => e.column === 'Display ID').map((e) => e.row).sort()).toEqual([2, 3]);
  });

  it.each(['clientDisplayId', 'openings', 'status', 'quality'])(
    'rejects a blank required column (%s) on both an insert and an update row',
    async (field) => {
      const { service } = makeServices();
      const buffer = await makeJobOrderWorkbook([
        validRow({ [field]: '' }),
        validRow({ [field]: '', displayId: EXISTING_JOB_ORDER.displayId }),
      ]);

      const { errors, plans } = await service.validate(buffer);

      expect(plans).toEqual([]);
      expect(errors.filter((e) => e.row === 2)).toHaveLength(1);
      expect(errors.filter((e) => e.row === 3)).toHaveLength(1);
    },
  );

  it('rejects a Client Display ID that matches no existing company', async () => {
    const { service } = makeServices({ clients: [] });
    const buffer = await makeJobOrderWorkbook([validRow()]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Client Display ID' })]);
  });

  it('rejects an unresolvable Location', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ location: 'Nowhere > Fake City' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Location' })]);
  });

  it('accepts a resolvable Location', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ location: LOCATION_PATH })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ kind: 'insert', data: { locationId: LOCATION.id } });
  });

  it('rejects Openings that is not a whole number ≥ 1', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ openings: '0' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Openings' })]);
  });

  it('rejects a Priority Level outside 1-3', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ priorityLevel: '9' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Priority Level' })]);
  });

  it('clears Priority Level to null when blank on an update row (it is nullable, not required)', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ displayId: EXISTING_JOB_ORDER.displayId, priorityLevel: '' })]);

    const { plans } = await service.validate(buffer);

    expect(plans[0]).toMatchObject({ kind: 'update', data: { priorityLevel: null } });
  });

  it('rejects a non-numeric Salary Min', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ salaryMin: 'not a number' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Salary Min' })]);
  });

  it('rejects an invalid Status enum value', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ status: 'ON_FIRE' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Status' })]);
  });

  it('never resolves Job Title/Role Type to an id during validate — auto-create only happens at commit time', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ jobTitle: 'Brand New Title', jobRoleType: 'Brand New Role' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ jobTitle: 'Brand New Title', jobRoleType: 'Brand New Role' });
  });

  it('clears an optional column left blank on an update row', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ displayId: EXISTING_JOB_ORDER.displayId, description: '' })]);

    const { plans } = await service.validate(buffer);

    expect(plans[0]).toMatchObject({ kind: 'update', data: { description: null } });
  });

  it('routes a blank Display ID to insert, a matching one to update', async () => {
    const { service } = makeServices();
    const buffer = await makeJobOrderWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_JOB_ORDER.displayId }),
    ]);

    const { plans } = await service.validate(buffer);

    expect(plans).toEqual([
      expect.objectContaining({ kind: 'insert' }),
      expect.objectContaining({ kind: 'update', existingId: EXISTING_JOB_ORDER.id }),
    ]);
  });
});

describe('JobOrdersImportService.importFromWorkbook', () => {
  it('commit: false never writes and never auto-creates a Job Title/Role Type', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ jobTitle: 'Production Manager', jobRoleType: 'Electrician' })]);

    const result = await service.importFromWorkbook(buffer, false, 'test.xlsx');

    expect(result).toMatchObject({ committed: false, insertCount: 1 });
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(tx.jobOrder.create).not.toHaveBeenCalled();
    expect(tx.jobTitle.upsert).not.toHaveBeenCalled();
  });

  it('commit: true auto-creates unmatched Job Title/Role Type via upsert, inside the transaction', async () => {
    const { service, tx } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow({ jobTitle: 'Production Manager', jobRoleType: 'Electrician' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(true);
    expect(tx.jobTitle.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Production Manager' } }),
    );
    expect(tx.jobRoleType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Electrician' } }),
    );
    expect(tx.jobOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobTitleId: 'jt1', jobRoleTypeId: 'jrt1' }) }),
    );
  });

  it('commit: true with any row error writes nothing', async () => {
    const { service, base } = makeServices();
    const buffer = await makeJobOrderWorkbook([validRow(), validRow({ openings: '-1' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(false);
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('commit: true with zero errors writes every row and audits with metadata.source "import"', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeJobOrderWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_JOB_ORDER.displayId }),
    ]);

    const result = await service.importFromWorkbook(buffer, true, 'job-orders.xlsx');

    expect(result).toMatchObject({ committed: true, insertCount: 1, updateCount: 1, errors: [] });
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.jobOrder.create).toHaveBeenCalledTimes(1);
    expect(tx.jobOrder.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: expect.objectContaining({ source: 'import', fileName: 'job-orders.xlsx' }) }),
      }),
    );
  });

  it('rejects a file over the byte-size cap before parsing', async () => {
    const { service } = makeServices();
    const oversized = Buffer.alloc(11 * 1024 * 1024);

    await expect(service.importFromWorkbook(oversized, false, 'huge.xlsx')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('JobOrdersImportService.buildTemplate', () => {
  it('bundles Companies, Job Titles, Job Role Types, and Locations reference sheets', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Job Orders', 'Instructions', 'Companies', 'Job Titles', 'Job Role Types', 'Locations']),
    );
  });

  it('only offers active catalog rows — filters isActive: true for the growable Job Title and Job Role Type catalogs', async () => {
    const { service, base } = makeServices();
    await service.buildTemplate();

    expect(base.jobTitle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(base.jobRoleType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('wires the Status column dropdown to its inline enum list', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const dataSheet = workbook.getWorksheet('Job Orders')!;
    const statusColIndex = JOB_ORDER_IMPORT_COLUMNS.findIndex((c) => c.key === 'status') + 1;
    const validation = dataSheet.getRow(2).getCell(statusColIndex).dataValidation;
    expect(validation).toMatchObject({ type: 'list', formulae: ['"ACTIVE,PLACED,CLOSED,ON_HOLD"'] });
  });

  it('wires the Location column dropdown to the Locations reference sheet\'s named range', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const definedName = workbook.definedNames.model.find((d) => d.name.includes('Locations') && d.name.includes('name'));
    expect(definedName).toBeDefined();

    const dataSheet = workbook.getWorksheet('Job Orders')!;
    const locationColIndex = JOB_ORDER_IMPORT_COLUMNS.findIndex((c) => c.key === 'location') + 1;
    const validation = dataSheet.getRow(2).getCell(locationColIndex).dataValidation;
    expect(validation?.type).toBe('list');
    expect(validation?.formulae?.[0]).toBe(definedName?.name);
  });
});
