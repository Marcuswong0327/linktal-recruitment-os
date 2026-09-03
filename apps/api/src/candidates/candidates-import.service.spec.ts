import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { CandidatesImportService, CANDIDATE_IMPORT_COLUMNS } from './candidates-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExtendedPrismaClient } from '../prisma/prisma.extensions';

const INDUSTRY = { id: 'ind1', name: 'Manufacturing' };
const LOCATION = { id: 'loc-syd', name: 'Sydney NSW', ancestorIds: ['loc-syd', 'loc-au'] };
const LOCATION_ANCESTORS = [
  { id: 'loc-au', name: 'Australia', ancestorIds: ['loc-au'] },
  LOCATION,
];
const LOCATION_PATH = 'Sydney NSW';
const EXISTING_CANDIDATE = { id: 'cand1', displayId: 'CDD-000001' };

async function makeCandidateWorkbook(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Candidates');
  sheet.addRow(CANDIDATE_IMPORT_COLUMNS.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(CANDIDATE_IMPORT_COLUMNS.map((c) => row[c.key] ?? ''));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function validRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    location: LOCATION_PATH,
    industry: INDUSTRY.name,
    status: 'COLD',
    ...overrides,
  };
}

function makeTx() {
  return {
    candidate: {
      create: jest.fn().mockResolvedValue({ id: 'new1' }),
      update: jest.fn().mockResolvedValue({ id: EXISTING_CANDIDATE.id }),
      findUnique: jest.fn().mockResolvedValue({ id: EXISTING_CANDIDATE.id, firstName: 'Old' }),
    },
    jobRoleType: {
      upsert: jest.fn().mockResolvedValue({ id: 'jrt1', name: 'Electrician' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeServices(opts: {
  industries?: { id: string; name: string }[];
  locations?: { id: string; name: string; ancestorIds: string[] }[];
  specializations?: { id: string; name: string; industryId: string }[];
  jobRoleTypes?: { name: string }[];
  existingCandidates?: { id: string; displayId: string }[];
} = {}) {
  const tx = makeTx();
  const base = {
    industry: { findMany: jest.fn().mockResolvedValue(opts.industries ?? [INDUSTRY]) },
    location: { findMany: jest.fn().mockResolvedValue(opts.locations ?? LOCATION_ANCESTORS) },
    specialization: { findMany: jest.fn().mockResolvedValue(opts.specializations ?? []) },
    jobRoleType: { findMany: jest.fn().mockResolvedValue(opts.jobRoleTypes ?? []) },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };
  const prisma = {
    candidate: { findMany: jest.fn().mockResolvedValue(opts.existingCandidates ?? [EXISTING_CANDIDATE]) },
  };
  const service = new CandidatesImportService(
    prisma as unknown as ExtendedPrismaClient,
    base as unknown as PrismaService,
  );
  return { service, base, prisma, tx };
}

describe('CandidatesImportService.validate', () => {
  it('rejects the whole file when two rows share a non-blank Display ID', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([
      validRow({ displayId: EXISTING_CANDIDATE.displayId }),
      validRow({ displayId: EXISTING_CANDIDATE.displayId }),
    ]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors.filter((e) => e.column === 'Display ID').map((e) => e.row).sort()).toEqual([2, 3]);
  });

  it.each(['location', 'industry', 'status'])(
    'rejects a blank required column (%s) on both an insert and an update row',
    async (field) => {
      const { service } = makeServices();
      const buffer = await makeCandidateWorkbook([
        validRow({ [field]: '' }),
        validRow({ [field]: '', displayId: EXISTING_CANDIDATE.displayId }),
      ]);

      const { errors, plans } = await service.validate(buffer);

      expect(plans).toEqual([]);
      expect(errors.filter((e) => e.row === 2)).toHaveLength(1);
      expect(errors.filter((e) => e.row === 3)).toHaveLength(1);
    },
  );

  it('rejects an unresolvable Location', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ location: 'Nowhere > Fake City' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Location' })]);
  });

  it('rejects an unresolvable Industry — never auto-created (restricted catalog)', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ industry: 'Not Real' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Industry' })]);
  });

  it('resolves multiple Specializations scoped to the resolved Industry', async () => {
    const { service } = makeServices({
      specializations: [
        { id: 'spec1', name: 'Food Bakery', industryId: INDUSTRY.id },
        { id: 'spec2', name: 'Food Meat', industryId: INDUSTRY.id },
      ],
    });
    const buffer = await makeCandidateWorkbook([validRow({ specializations: 'Food Bakery; Food Meat' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ specializationIds: ['spec1', 'spec2'] });
  });

  it('rejects a Specialization that exists but under a different industry', async () => {
    const { service } = makeServices({
      specializations: [{ id: 'spec1', name: 'Food Bakery', industryId: 'other-industry' }],
    });
    const buffer = await makeCandidateWorkbook([validRow({ specializations: 'Food Bakery' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Specializations' })]);
  });

  it('never resolves Job Role Type to an id during validate — auto-create only happens at commit time', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ jobRoleType: 'Brand New Role Type' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(errors).toEqual([]);
    expect(plans[0]).toMatchObject({ jobRoleType: 'Brand New Role Type' });
  });

  it('rejects an invalid email address', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ email: 'not-an-email' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Email' })]);
  });

  it('rejects an invalid resume URL', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ rawResumeUrl: 'not a url' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Raw Resume URL' })]);
  });

  it('rejects an invalid Status enum value', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ status: 'BOILING' })]);

    const { errors, plans } = await service.validate(buffer);

    expect(plans).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ row: 2, column: 'Status' })]);
  });

  it('clears an optional column left blank on an update row', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ displayId: EXISTING_CANDIDATE.displayId, currentRole: '' })]);

    const { plans } = await service.validate(buffer);

    expect(plans[0]).toMatchObject({ kind: 'update', data: { currentRole: null } });
  });

  it('routes a blank Display ID to insert, a matching one to update', async () => {
    const { service } = makeServices();
    const buffer = await makeCandidateWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_CANDIDATE.displayId }),
    ]);

    const { plans } = await service.validate(buffer);

    expect(plans).toEqual([
      expect.objectContaining({ kind: 'insert' }),
      expect.objectContaining({ kind: 'update', existingId: EXISTING_CANDIDATE.id }),
    ]);
  });
});

describe('CandidatesImportService.importFromWorkbook', () => {
  it('commit: false never writes and never auto-creates a Job Role Type', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ jobRoleType: 'Electrician' })]);

    const result = await service.importFromWorkbook(buffer, false, 'test.xlsx');

    expect(result).toMatchObject({ committed: false, insertCount: 1 });
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(tx.candidate.create).not.toHaveBeenCalled();
    expect(tx.jobRoleType.upsert).not.toHaveBeenCalled();
  });

  it('commit: true auto-creates an unmatched Job Role Type via upsert, inside the transaction', async () => {
    const { service, tx } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow({ jobRoleType: 'Electrician' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(true);
    expect(tx.jobRoleType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Electrician' }, create: { name: 'Electrician' } }),
    );
    expect(tx.candidate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ jobRoleTypeId: 'jrt1' }) }),
    );
  });

  it('commit: true with any row error writes nothing', async () => {
    const { service, base } = makeServices();
    const buffer = await makeCandidateWorkbook([validRow(), validRow({ industry: '' })]);

    const result = await service.importFromWorkbook(buffer, true, 'test.xlsx');

    expect(result.committed).toBe(false);
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it('commit: true with zero errors writes every row and audits with metadata.source "import"', async () => {
    const { service, base, tx } = makeServices();
    const buffer = await makeCandidateWorkbook([
      validRow(),
      validRow({ displayId: EXISTING_CANDIDATE.displayId }),
    ]);

    const result = await service.importFromWorkbook(buffer, true, 'candidates.xlsx');

    expect(result).toMatchObject({ committed: true, insertCount: 1, updateCount: 1, errors: [] });
    expect(base.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.candidate.create).toHaveBeenCalledTimes(1);
    expect(tx.candidate.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: expect.objectContaining({ source: 'import', fileName: 'candidates.xlsx' }) }),
      }),
    );
  });

  it('rejects a file over the byte-size cap before parsing', async () => {
    const { service } = makeServices();
    const oversized = Buffer.alloc(11 * 1024 * 1024);

    await expect(service.importFromWorkbook(oversized, false, 'huge.xlsx')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CandidatesImportService.buildTemplate', () => {
  it('bundles Locations, Industries, Specializations, and Job Role Types reference sheets', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Candidates', 'Instructions', 'Locations', 'Industries', 'Specializations', 'Job Role Types']),
    );
  });

  it('only offers active catalog rows — filters isActive: true for Industry, Specialization, and the growable Job Role Type', async () => {
    const { service, base } = makeServices();
    await service.buildTemplate();

    expect(base.industry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(base.specialization.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(base.jobRoleType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('wires the growable Job Role Type column dropdown to the Job Role Types reference sheet\'s named range', async () => {
    const { service } = makeServices({ jobRoleTypes: [{ name: 'Electrician' }] });
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const definedName = workbook.definedNames.model.find((d) => d.name.includes('JobRoleTypes'));
    expect(definedName).toBeDefined();

    const dataSheet = workbook.getWorksheet('Candidates')!;
    const jobRoleTypeColIndex = CANDIDATE_IMPORT_COLUMNS.findIndex((c) => c.key === 'jobRoleType') + 1;
    const validation = dataSheet.getRow(2).getCell(jobRoleTypeColIndex).dataValidation;
    expect(validation?.type).toBe('list');
    expect(validation?.formulae?.[0]).toBe(definedName?.name);
  });

  it('does not put a dropdown on the multi-value Specializations column', async () => {
    const { service } = makeServices();
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const dataSheet = workbook.getWorksheet('Candidates')!;
    const specializationsColIndex = CANDIDATE_IMPORT_COLUMNS.findIndex((c) => c.key === 'specializations') + 1;
    const validation = dataSheet.getRow(2).getCell(specializationsColIndex).dataValidation;
    expect(validation).toBeUndefined();
  });
});
