import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { JobResearchImportService, JOB_RESEARCH_IMPORT_COLUMNS } from './job-research-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

const CLIENT = { id: 'client1', displayId: 'CLI-000001' };
const CONSULTANT = { id: 'cst1', displayId: 'CST-000001' };
const LOCATION = { id: 'loc-syd', name: 'Sydney NSW', ancestorIds: ['loc-syd', 'loc-au'] };
const LOCATION_ANCESTORS = [
  { id: 'loc-au', name: 'Australia', ancestorIds: ['loc-au'] },
  LOCATION,
];
const LOCATION_PATH = 'Sydney NSW';
const EXISTING_RESEARCH = { id: 'jr1', displayId: 'JR-000001' };

async function makeJobResearchWorkbook(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Job Research');
  sheet.addRow(JOB_RESEARCH_IMPORT_COLUMNS.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(JOB_RESEARCH_IMPORT_COLUMNS.map((c) => row[c.key] ?? ''));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    clientDisplayId: CLIENT.displayId,
    isContacted: 'No',
    ...overrides,
  };
}

function makeTx() {
  return {
    clientJobResearch: {
      create: jest.fn().mockResolvedValue({ id: 'new1' }),
      update: jest.fn().mockResolvedValue({ id: EXISTING_RESEARCH.id }),
      findUnique: jest.fn().mockResolvedValue({ id: EXISTING_RESEARCH.id, isContacted: false }),
    },
    jobTitle: {
      upsert: jest.fn().mockResolvedValue({ id: 'jt1', name: 'Maintenance Fitter' }),
    },
    jobRoleType: {
      upsert: jest.fn().mockResolvedValue({ id: 'jrt1', name: 'Mechanical Fitter' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeServices(opts: {
  clients?: { id: string; displayId: string }[];
  consultants?: { id: string; displayId: string }[];
  locations?: { id: string; name: string; ancestorIds: string[] }[];
  jobTitles?: { name: string }[];
  jobRoleTypes?: { name: string }[];
  existingResearch?: { id: string; displayId: string }[];
} = {}) {
  const tx = makeTx();
  const base = {
    consultant: { findMany: jest.fn().mockResolvedValue(opts.consultants ?? [CONSULTANT]) },
    location: { findMany: jest.fn().mockResolvedValue(opts.locations ?? LOCATION_ANCESTORS) },
    jobTitle: { findMany: jest.fn().mockResolvedValue(opts.jobTitles ?? []) },
    jobRoleType: { findMany: jest.fn().mockResolvedValue(opts.jobRoleTypes ?? []) },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };
  const prisma = {
    client: { findMany: jest.fn().mockResolvedValue(opts.clients ?? [CLIENT]) },
    clientJobResearch: { findMany: jest.fn().mockResolvedValue(opts.existingResearch ?? [EXISTING_RESEARCH]) },
  };
  const service = new JobResearchImportService(
    prisma as unknown as ExtendedPrismaClient,
    base as unknown as PrismaService,
  );
  return { service, base, prisma, tx };
}

describe('JobResearchImportService.validate', () => {
  it('rejects the whole file when two rows share a non-blank Display ID', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([
      validRow({ displayId: EXISTING_RESEARCH.displayId }),
      validRow({ displayId: EXISTING_RESEARCH.displayId }),
    ]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors.filter((e) => e.column === 'Display ID').map((e) => e.row).sort()).toEqual([2, 3]);
  });

  it.each(['clientDisplayId', 'isContacted'])(
    'rejects a blank required column (%s) on both an insert and an update row',
    async (field) => {
      const { service } = makeServices();
      const buffer = await makeJobResearchWorkbook([
        validRow({ [field]: '' }),
        validRow({ [field]: '', displayId: EXISTING_RESEARCH.displayId }),
      ]);

      const { errors, plans } = await service.validate(buffer);

      expect(plans).toEqual([]);
      expect(errors.filter((e) => e.row === 2)).toHaveLength(1);
      expect(errors.filter((e) => e.row === 3)).toHaveLength(1);
    },
  );

  it('rejects a Client Display ID that matches no existing company', async () => {
    const { service } = makeServices({ clients: [] });
    const buffer = await makeJobResearchWorkbook([validRow()]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Client Display ID' })]);
  });

  it('rejects a Consultant Display ID that matches no existing consultant', async () => {
    const { service } = makeServices({ consultants: [] });
    const buffer = await makeJobResearchWorkbook([validRow({ consultantDisplayId: CONSULTANT.displayId })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Consultant Display ID' })]);
  });

  it('accepts a resolvable Consultant Display ID', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ consultantDisplayId: CONSULTANT.displayId })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ kind: 'insert', data: { consultantId: CONSULTANT.id } });
  });

  it('rejects an unresolvable Location', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ location: 'Nowhere > Fake City' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Location' })]);
  });

  it('accepts a resolvable Location', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ location: LOCATION_PATH })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ kind: 'insert', data: { locationId: LOCATION.id } });
  });

  it('rejects an invalid Status enum value', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ status: 'BOILING' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Status' })]);
  });

  it('rejects an unparseable Posted Date', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ postedDate: 'not a date' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Posted Date' })]);
  });

  it('rejects a malformed Contact Email', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ contactEmailFromAd: 'not-an-email' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Contact Email' })]);
  });

  it('rejects an Is Contacted value that is not Yes/No', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ isContacted: 'Maybe' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Is Contacted' })]);
  });

  it('never resolves Job Title/Job Role Type to an id during validate — auto-create only happens at commit time', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ jobTitle: 'Brand New Title', jobRoleType: 'Brand New Role' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ jobTitle: 'Brand New Title', jobRoleType: 'Brand New Role' });
  });

  it('clears an optional column left blank on an update row', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([
      validRow({ displayId: EXISTING_RESEARCH.displayId, consultantDisplayId: '', notes: '' }),
    ]);

    const { plans } = await service.validate(buffer);

    expect(plans[0]).toMatchObject({ kind: 'update', data: { consultantId: null, notes: null } });
  });

  it('routes a blank Display ID to insert, a matching one to update', async () => {
    const { service } = makeServices();
    const buffer = await makeJobResearchWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_RESEARCH.displayId }),
    ]);

    const { plans } = await service.validate(buffer);

    expect(plans).toEqual([
      expect.objectContaining({ kind: 'insert' }),
      expect.objectContaining({ kind: 'update', existingId: EXISTING_RESEARCH.id }),
    ]);
  });
});

describe('JobResearchImportService.importFromWorkbook', () => {
  it('commit: false never writes and never auto-creates a Job Title/Role Type', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ jobTitle: 'Maintenance Fitter', jobRoleType: 'Mechanical Fitter' })]);

    const result = await service.importFromWorkbook(buffer, false, 'test.xlsx');

    expect(result).toMatchObject({ committed: false, insertCount: 1 });
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(tx.clientJobResearch.create).not.toHaveBeenCalled();
    expect(tx.jobTitle.upsert).not.toHaveBeenCalled();
  });

  it('commit: true auto-creates unmatched Job Title/Role Type via upsert, inside the transaction', async () => {
    const { service, tx } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow({ jobTitle: 'Maintenance Fitter', jobRoleType: 'Mechanical Fitter' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(true);
    expect(tx.jobTitle.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'Maintenance Fitter' } }));
    expect(tx.jobRoleType.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'Mechanical Fitter' } }));
    expect(tx.clientJobResearch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobTitleId: 'jt1', jobRoleTypeId: 'jrt1' }) }),
    );
  });

  it('commit: true with any row error writes nothing', async () => {
    const { service, base } = makeServices();
    const buffer = await makeJobResearchWorkbook([validRow(), validRow({ isContacted: 'Maybe' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(false);
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('commit: true with zero errors writes every row and audits with metadata.source "import"', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeJobResearchWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_RESEARCH.displayId }),
    ]);

    const result = await service.importFromWorkbook(buffer, true, 'job-research.xlsx');

    expect(result).toMatchObject({ committed: true, insertCount: 1, updateCount: 1, errors: [] });
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.clientJobResearch.create).toHaveBeenCalledTimes(1);
    expect(tx.clientJobResearch.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: expect.objectContaining({ source: 'import', fileName: 'job-research.xlsx' }) }),
      }),
    );
  });

  it('rejects a file over the byte-size cap before parsing', async () => {
    const { service } = makeServices();
    const oversized = Buffer.alloc(11 * 1024 * 1024);

    await expect(service.importFromWorkbook(oversized, false, 'huge.xlsx')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('JobResearchImportService.buildTemplate', () => {
  it('bundles Companies, Consultants, Job Titles, Job Role Types, and Locations reference sheets', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Job Research', 'Instructions', 'Companies', 'Consultants', 'Job Titles', 'Job Role Types', 'Locations']),
    );
  });

  it('only offers active consultants and catalog rows', async () => {
    const { service, base } = makeServices();
    await service.buildTemplate();

    expect(base.consultant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(base.jobTitle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(base.jobRoleType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('wires the Status column dropdown to its inline enum list', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const dataSheet = workbook.getWorksheet('Job Research')!;
    const statusColIndex = JOB_RESEARCH_IMPORT_COLUMNS.findIndex((c) => c.key === 'status') + 1;
    const validation = dataSheet.getRow(2).getCell(statusColIndex).dataValidation;
    expect(validation).toMatchObject({ type: 'list', formulae: ['"COLD,WARM,TRADED"'] });
  });

  it('wires the Location column dropdown to the Locations reference sheet\'s named range', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const definedName = workbook.definedNames.model.find((d) => d.name.includes('Locations') && d.name.includes('name'));
    expect(definedName).toBeDefined();

    const dataSheet = workbook.getWorksheet('Job Research')!;
    const locationColIndex = JOB_RESEARCH_IMPORT_COLUMNS.findIndex((c) => c.key === 'location') + 1;
    const validation = dataSheet.getRow(2).getCell(locationColIndex).dataValidation;
    expect(validation?.type).toBe('list');
    expect(validation?.formulae?.[0]).toBe(definedName?.name);
  });
});
