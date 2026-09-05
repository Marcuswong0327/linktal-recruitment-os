import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { ClientsImportService, CLIENT_IMPORT_COLUMNS } from './clients-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

const INDUSTRY = { id: 'ind1', name: 'Manufacturing' };
// ancestorIds is self plus every ancestor, root-LAST (see schema.prisma's
// Location.ancestorIds doc) — self-first here, not root-first.
const LOCATION = { id: 'loc-syd', name: 'Sydney NSW', ancestorIds: ['loc-syd', 'loc-au'] };
const LOCATION_ANCESTORS = [
  { id: 'loc-au', name: 'Australia', ancestorIds: ['loc-au'] },
  LOCATION,
];
const LOCATION_PATH = 'Sydney NSW';
const EXISTING_CLIENT = { id: 'client1', displayId: 'CLI-000001' };

/** Builds an .xlsx buffer with CLIENT_IMPORT_COLUMNS headers — missing keys default to ''. */
async function makeClientWorkbook(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Companies');
  sheet.addRow(CLIENT_IMPORT_COLUMNS.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(CLIENT_IMPORT_COLUMNS.map((c) => row[c.key] ?? ''));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** A row with every required column filled in, valid by default — override just the fields under test. */
function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    companyName: 'Acme Corp',
    industry: INDUSTRY.name,
    locations: LOCATION_PATH,
    status: 'COLD',
    quality: 'MEDIUM',
    ...overrides,
  };
}

function makeTx() {
  return {
    client: {
      create: jest.fn().mockResolvedValue({ id: 'new1', companyName: 'Acme Corp' }),
      update: jest.fn().mockResolvedValue({ id: EXISTING_CLIENT.id, companyName: 'Acme Corp' }),
      findUnique: jest.fn().mockResolvedValue({ id: EXISTING_CLIENT.id, companyName: 'Old Name', website: 'https://old.com' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeServices(opts: {
  industries?: { id: string; name: string }[];
  locations?: { id: string; name: string; ancestorIds: string[] }[];
  specializations?: { id: string; name: string; industryId: string }[];
  existingClients?: { id: string; displayId: string }[];
} = {}) {
  const tx = makeTx();
  const base = {
    industry: { findMany: jest.fn().mockResolvedValue(opts.industries ?? [INDUSTRY]) },
    location: { findMany: jest.fn().mockResolvedValue(opts.locations ?? LOCATION_ANCESTORS) },
    specialization: { findMany: jest.fn().mockResolvedValue(opts.specializations ?? []) },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };
  const prisma = {
    client: { findMany: jest.fn().mockResolvedValue(opts.existingClients ?? [EXISTING_CLIENT]) },
  };
  const service = new ClientsImportService(
    prisma as unknown as ExtendedPrismaClient,
    base as unknown as PrismaService,
  );
  return { service, base, prisma, tx };
}

describe('ClientsImportService.validate', () => {
  it('rejects the whole file when two rows share a non-blank Display ID, naming both rows', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([
      validRow({ displayId: EXISTING_CLIENT.displayId }),
      validRow({ displayId: EXISTING_CLIENT.displayId, companyName: 'Beta LLC' }),
    ]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    const displayIdErrors = errors.filter((e) => e.column === 'Display ID');
    expect(displayIdErrors.map((e) => e.row).sort()).toEqual([2, 3]);
  });

  it.each(['companyName', 'industry', 'locations', 'status', 'quality'])(
    'rejects a blank required column (%s) on an insert row (blank Display ID)',
    async (field) => {
      const { service } = makeServices();
      const buffer = await makeClientWorkbook([validRow({ [field]: '' })]);

      const { errors, plans } = await service.validate(buffer);

      expect(plans).toEqual([]);
      expect(errors.some((e) => e.row === 2)).toBe(true);
    },
  );

  it.each(['companyName', 'industry', 'locations', 'status', 'quality'])(
    'rejects a blank required column (%s) on an update row (matching Display ID) too — no exception for updates',
    async (field) => {
      const { service } = makeServices();
      const buffer = await makeClientWorkbook([validRow({ displayId: EXISTING_CLIENT.displayId, [field]: '' })]);

      const { errors, plans } = await service.validate(buffer);

      expect(plans).toEqual([]);
      expect(errors.some((e) => e.row === 2)).toBe(true);
    },
  );

  it('rejects a Display ID that matches no existing client — never treated as a valid new id', async () => {
    const { service } = makeServices({ existingClients: [] });
    const buffer = await makeClientWorkbook([validRow({ displayId: 'CLI-999999' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({ row: 2, column: 'Display ID' }),
    ]);
  });

  it('routes a blank Display ID to insert', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([validRow()]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans).toEqual([expect.objectContaining({ kind: 'insert' })]);
  });

  it('routes a matching Display ID to update', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([validRow({ displayId: EXISTING_CLIENT.displayId })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans).toEqual([
      expect.objectContaining({ kind: 'update', existingId: EXISTING_CLIENT.id }),
    ]);
  });

  it('clears an optional column left blank on an update row (decision: blank on update = clear, not leave-unchanged)', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([validRow({ displayId: EXISTING_CLIENT.displayId, website: '' })]);

    const { plans } = await service.validate(buffer);

    expect(plans[0]).toMatchObject({ kind: 'update', data: { website: null } });
  });

  it('omits (does not send null for) an optional column left blank on an insert row — nothing to clear', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([validRow({ website: '' })]);

    const { plans } = await service.validate(buffer);

    expect(plans[0].kind).toBe('insert');
    expect((plans[0] as { data: { website?: unknown } }).data.website).toBeUndefined();
  });

  it('rejects an unresolvable Industry name — never guesses, never auto-creates', async () => {
    const { service, base } = makeServices();
    const buffer = await makeClientWorkbook([validRow({ industry: 'Not A Real Industry' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Industry' })]);
    // No write of any kind happened during validate — it's a read-only pass.
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unresolvable Location path', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([validRow({ locations: 'Nowhere > Fake City' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Locations' })]);
  });

  it('rejects an unresolvable Specialization scoped to the resolved Industry', async () => {
    const { service } = makeServices({
      specializations: [{ id: 'spec1', name: 'Bakery', industryId: 'some-other-industry' }],
    });
    const buffer = await makeClientWorkbook([validRow({ specialization: 'Bakery' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Specialization' })]);
  });

  it('rejects an invalid Status/Quality enum value', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([validRow({ status: 'BOILING' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Status' })]);
  });

  it('rejects an invalid URL in an optional URL column', async () => {
    const { service } = makeServices();
    const buffer = await makeClientWorkbook([validRow({ website: 'not a url' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Website' })]);
  });
});

describe('ClientsImportService.importFromWorkbook', () => {
  it('commit: false (preview) never writes, regardless of validation outcome', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeClientWorkbook([validRow()]);

    const result = await service.importFromWorkbook(buffer, false, 'test.xlsx');

    expect(result).toMatchObject({ committed: false, insertCount: 1, updateCount: 0, errors: [] });
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it('commit: true with any row error writes nothing — all-or-nothing', async () => {
    const { service, base } = makeServices();
    const buffer = await makeClientWorkbook([validRow(), validRow({ companyName: '' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('commit: true with zero errors writes every row and audits each with metadata.source "import"', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeClientWorkbook([
      validRow(), // insert
      validRow({ displayId: EXISTING_CLIENT.displayId }), // update
    ]);

    const result = await service.importFromWorkbook(buffer, true, 'companies.xlsx');

    expect(result).toMatchObject({ committed: true, insertCount: 1, updateCount: 1, errors: [] });
    expect(base.$transaction).toHaveBeenCalledTimes(1); // one chunk for 2 rows
    expect(tx.client.create).toHaveBeenCalledTimes(1);
    expect(tx.client.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CREATE', entityType: 'Client', metadata: expect.objectContaining({ source: 'import', fileName: 'companies.xlsx' }) }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'UPDATE', entityType: 'Client' }),
      }),
    );
  });

  it('chunks a commit into groups of 100 rows — one $transaction call per chunk', async () => {
    const { service, base } = makeServices();
    const rows = Array.from({ length: 150 }, () => validRow());
    const buffer = await makeClientWorkbook(rows);

    await service.importFromWorkbook(buffer, true, 'big.xlsx');

    expect(base.$transaction).toHaveBeenCalledTimes(2); // 100 + 50
  });

  it('rejects a file over the byte-size cap before parsing', async () => {
    const { service } = makeServices();
    const oversized = Buffer.alloc(11 * 1024 * 1024);

    await expect(service.importFromWorkbook(oversized, false, 'huge.xlsx')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('ClientsImportService.buildTemplate', () => {
  it('bundles Industries, Specializations, and Locations reference sheets alongside the Data/Instructions sheets', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Companies', 'Instructions', 'Industries', 'Specializations', 'Locations']),
    );
  });

  it('only offers active catalog rows — filters isActive: true for Industry and Specialization', async () => {
    const { service, base } = makeServices();
    await service.buildTemplate();

    expect(base.industry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(base.specialization.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('wires the Industry column dropdown to the Industries reference sheet\'s named range', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const definedName = workbook.definedNames.model.find((d) => d.name.includes('Industries'));
    expect(definedName).toBeDefined();

    const dataSheet = workbook.getWorksheet('Companies')!;
    const industryColIndex = CLIENT_IMPORT_COLUMNS.findIndex((c) => c.key === 'industry') + 1;
    const validation = dataSheet.getRow(2).getCell(industryColIndex).dataValidation;
    expect(validation?.type).toBe('list');
    expect(validation?.formulae?.[0]).toBe(definedName?.name);
  });

  it('does not put a dropdown on the multi-value Locations column', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const dataSheet = workbook.getWorksheet('Companies')!;
    const locationsColIndex = CLIENT_IMPORT_COLUMNS.findIndex((c) => c.key === 'locations') + 1;
    const validation = dataSheet.getRow(2).getCell(locationsColIndex).dataValidation;
    expect(validation).toBeUndefined();
  });
});
