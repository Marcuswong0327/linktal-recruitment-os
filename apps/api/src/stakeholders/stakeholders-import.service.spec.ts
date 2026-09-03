import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { StakeholdersImportService, STAKEHOLDER_IMPORT_COLUMNS } from './stakeholders-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

const CLIENT = { id: 'client1', displayId: 'CLI-000001' };
const LOCATION = { id: 'loc-syd', name: 'Sydney NSW', ancestorIds: ['loc-syd', 'loc-au'] };
const LOCATION_ANCESTORS = [
  { id: 'loc-au', name: 'Australia', ancestorIds: ['loc-au'] },
  LOCATION,
];
const LOCATION_PATH = 'Sydney NSW';
const EXISTING_STAKEHOLDER = { id: 'stk1', displayId: 'STK-000001' };

async function makeStakeholderWorkbook(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stakeholders');
  sheet.addRow(STAKEHOLDER_IMPORT_COLUMNS.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(STAKEHOLDER_IMPORT_COLUMNS.map((c) => row[c.key] ?? ''));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    clientDisplayId: CLIENT.displayId,
    ...overrides,
  };
}

function makeTx() {
  return {
    stakeholder: {
      create: jest.fn().mockResolvedValue({ id: 'new1' }),
      update: jest.fn().mockResolvedValue({ id: EXISTING_STAKEHOLDER.id }),
      findUnique: jest.fn().mockResolvedValue({ id: EXISTING_STAKEHOLDER.id, firstName: 'Old' }),
    },
    jobTitle: {
      upsert: jest.fn().mockResolvedValue({ id: 'jt1', name: 'Recruiter' }),
    },
    stakeholderRoleType: {
      upsert: jest.fn().mockResolvedValue({ id: 'rt1', name: 'Talent Acquisition' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeServices(opts: {
  clients?: { id: string; displayId: string }[];
  locations?: { id: string; name: string; ancestorIds: string[] }[];
  jobTitles?: { name: string }[];
  roleTypes?: { name: string }[];
  existingStakeholders?: { id: string; displayId: string }[];
} = {}) {
  const tx = makeTx();
  const base = {
    location: { findMany: jest.fn().mockResolvedValue(opts.locations ?? LOCATION_ANCESTORS) },
    jobTitle: { findMany: jest.fn().mockResolvedValue(opts.jobTitles ?? []) },
    stakeholderRoleType: { findMany: jest.fn().mockResolvedValue(opts.roleTypes ?? []) },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };
  const prisma = {
    client: { findMany: jest.fn().mockResolvedValue(opts.clients ?? [CLIENT]) },
    stakeholder: { findMany: jest.fn().mockResolvedValue(opts.existingStakeholders ?? [EXISTING_STAKEHOLDER]) },
  };
  const service = new StakeholdersImportService(
    prisma as unknown as ExtendedPrismaClient,
    base as unknown as PrismaService,
  );
  return { service, base, prisma, tx };
}

describe('StakeholdersImportService.validate', () => {
  it('rejects the whole file when two rows share a non-blank Display ID', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([
      validRow({ displayId: EXISTING_STAKEHOLDER.displayId }),
      validRow({ displayId: EXISTING_STAKEHOLDER.displayId }),
    ]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors.filter((e) => e.column === 'Display ID').map((e) => e.row).sort()).toEqual([2, 3]);
  });

  it('rejects a blank Client Display ID (required) on both an insert and an update row', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([
      // firstName keeps each row from being a fully-blank row (which
      // parseWorkbook correctly skips outright, tested separately).
      validRow({ clientDisplayId: '', firstName: 'Jane' }),
      validRow({ clientDisplayId: '', firstName: 'Jane', displayId: EXISTING_STAKEHOLDER.displayId }),
    ]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors.filter((e) => e.column === 'Client Display ID')).toHaveLength(2);
  });

  it('rejects a Client Display ID that matches no existing company', async () => {
    const { service } = makeServices({ clients: [] });
    const buffer = await makeStakeholderWorkbook([validRow()]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Client Display ID' })]);
  });

  it('routes a blank Display ID to insert, a matching one to update', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_STAKEHOLDER.displayId }),
    ]);

    const { plans } = await service.validate(buffer);

    expect(plans).toEqual([
      expect.objectContaining({ kind: 'insert' }),
      expect.objectContaining({ kind: 'update', existingId: EXISTING_STAKEHOLDER.id }),
    ]);
  });

  it('never resolves Job Title/Role Type to an id during validate — auto-create only happens at commit time', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ jobTitle: 'Brand New Title', roleType: 'Brand New Role' })]);

    const { plans, errors } = await service.validate(buffer);

    expect(errors).toEqual([]); // an unmatched growable-catalog name is never a validation error
    expect(plans[0]).toMatchObject({ jobTitle: 'Brand New Title', roleType: 'Brand New Role' });
  });

  it('clears an optional column left blank on an update row', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ displayId: EXISTING_STAKEHOLDER.displayId, email: '' })]);

    const { plans } = await service.validate(buffer);

    expect(plans[0]).toMatchObject({ kind: 'update', data: { email: null } });
  });

  it('rejects an invalid email address', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ email: 'not-an-email' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Email' })]);
  });

  it('rejects an invalid LinkedIn URL', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ linkedinUrl: 'not a url' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'LinkedIn URL' })]);
  });

  it('rejects an unresolvable Coverage Locations path', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ coverageLocations: 'Nowhere > Fake City' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Coverage Locations' })]);
  });

  it('accepts a resolvable Coverage Locations path', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ coverageLocations: LOCATION_PATH })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ coverageLocationIds: [LOCATION.id] });
  });

  it('rejects "Details Accurate" values other than Yes/No/blank', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ isAccurate: 'Maybe' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Details Accurate' })]);
  });

  it('clears "Details Accurate" to null (not-yet-checked) when blank on an update row', async () => {
    const { service } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ displayId: EXISTING_STAKEHOLDER.displayId, isAccurate: '' })]);

    const { plans } = await service.validate(buffer);

    expect(plans[0]).toMatchObject({ kind: 'update', data: { isAccurate: null } });
  });
});

describe('StakeholdersImportService.importFromWorkbook', () => {
  it('commit: false never writes', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow()]);

    const result = await service.importFromWorkbook(buffer, false, 'test.xlsx');

    expect(result).toMatchObject({ committed: false, insertCount: 1 });
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(tx.stakeholder.create).not.toHaveBeenCalled();
    expect(tx.jobTitle.upsert).not.toHaveBeenCalled();
  });

  it('commit: true auto-creates an unmatched Job Title/Role Type via upsert, inside the transaction', async () => {
    const { service, tx } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ jobTitle: 'Recruiter', roleType: 'Talent Acquisition' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(true);
    expect(tx.jobTitle.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Recruiter' }, create: { name: 'Recruiter' } }),
    );
    expect(tx.stakeholderRoleType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Talent Acquisition' }, create: { name: 'Talent Acquisition' } }),
    );
    expect(tx.stakeholder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobTitleId: 'jt1', stakeholderRoleTypeId: 'rt1' }) }),
    );
  });

  it('commit: true with a blank Role Type auto-classifies from Job Title instead of leaving it unset', async () => {
    const { service, tx } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow({ jobTitle: 'Finance Director' })]);

    await service.importFromWorkbook(buffer, true, 'test.xlsx');

    // classifyRoleTypeId upserts against stakeholderRoleType with a name
    // derived from the keyword classifier — asserting the upsert happened at
    // all (with some name) is the meaningful check here, not the exact
    // keyword-matching rule, which role-type-classifier.spec.ts (if present)
    // or stakeholders.service.spec.ts already covers.
    expect(tx.stakeholderRoleType.upsert).toHaveBeenCalled();
    expect(tx.stakeholder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stakeholderRoleTypeId: 'rt1' }) }),
    );
  });

  it('commit: true with any row error writes nothing', async () => {
    const { service, base } = makeServices();
    const buffer = await makeStakeholderWorkbook([validRow(), validRow({ clientDisplayId: '', firstName: 'Jane' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(false);
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('commit: true with zero errors writes every row and audits with metadata.source "import"', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeStakeholderWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_STAKEHOLDER.displayId }),
    ]);

    const result = await service.importFromWorkbook(buffer, true, 'stakeholders.xlsx');

    expect(result).toMatchObject({ committed: true, insertCount: 1, updateCount: 1, errors: [] });
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.stakeholder.create).toHaveBeenCalledTimes(1);
    expect(tx.stakeholder.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: expect.objectContaining({ source: 'import', fileName: 'stakeholders.xlsx' }) }),
      }),
    );
  });

  it('rejects a file over the byte-size cap before parsing', async () => {
    const { service } = makeServices();
    const oversized = Buffer.alloc(11 * 1024 * 1024);

    await expect(service.importFromWorkbook(oversized, false, 'huge.xlsx')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('StakeholdersImportService.buildTemplate', () => {
  it('bundles Companies, Job Titles, Stakeholder Role Types, and Locations reference sheets', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Stakeholders', 'Instructions', 'Companies', 'Job Titles', 'Stakeholder Role Types', 'Locations']),
    );
  });

  it('only offers active catalog rows — filters isActive: true for the growable Job Title and Stakeholder Role Type catalogs', async () => {
    const { service, base } = makeServices();
    await service.buildTemplate();

    expect(base.jobTitle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(base.stakeholderRoleType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('wires the Client Display ID column dropdown to the Companies reference sheet\'s named range', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const definedName = workbook.definedNames.model.find((d) => d.name.includes('Companies'));
    expect(definedName).toBeDefined();

    const dataSheet = workbook.getWorksheet('Stakeholders')!;
    const clientDisplayIdColIndex = STAKEHOLDER_IMPORT_COLUMNS.findIndex((c) => c.key === 'clientDisplayId') + 1;
    const validation = dataSheet.getRow(2).getCell(clientDisplayIdColIndex).dataValidation;
    expect(validation?.type).toBe('list');
    expect(validation?.formulae?.[0]).toBe(definedName?.name);
  });

  it('does not put a dropdown on the multi-value Coverage Locations column', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const dataSheet = workbook.getWorksheet('Stakeholders')!;
    const coverageLocationsColIndex = STAKEHOLDER_IMPORT_COLUMNS.findIndex((c) => c.key === 'coverageLocations') + 1;
    const validation = dataSheet.getRow(2).getCell(coverageLocationsColIndex).dataValidation;
    expect(validation).toBeUndefined();
  });
});
