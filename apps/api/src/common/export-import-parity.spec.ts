import ExcelJS from 'exceljs';
import { ClientsService } from '../clients/clients.service';
import { CLIENT_IMPORT_COLUMNS } from '../clients/clients-import.service';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import { STAKEHOLDER_IMPORT_COLUMNS } from '../stakeholders/stakeholders-import.service';
import { CandidatesService } from '../candidates/candidates.service';
import { CANDIDATE_IMPORT_COLUMNS } from '../candidates/candidates-import.service';
import { JobOrdersService } from '../job-orders/job-orders.service';
import { JOB_ORDER_IMPORT_COLUMNS } from '../job-orders/job-orders-import.service';
import { JobResearchService } from '../job-research/job-research.service';
import { JOB_RESEARCH_IMPORT_COLUMNS } from '../job-research/job-research-import.service';
import { ImportColumn, REQUIRED_HEADER_SUFFIX } from './xlsx-import';
import { AuthUser } from '../auth/auth.types';

/**
 * Regression guard for the exact bug class a real Jam.dev bug report caught
 * live: "Export to Excel" and "Import" drifting to different column headers
 * for the same entity — ImportDialog's own instructions promise "export,
 * edit, re-upload to update" works, but `parseWorkbook` rejects the WHOLE
 * file (never even reaching row validation) the moment one expected header
 * is missing. This asserts every *_IMPORT_COLUMNS header is present
 * (case-insensitively — parseWorkbook's own matching rule) in what the real
 * export path actually writes as row 1, for every entity — not a
 * hand-maintained duplicate list that could itself drift, but the live
 * output of each service's real exportAll.
 */

function makeUser(): AuthUser {
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
  };
}

async function headerRow(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => headers.push(String(cell.value)));
  return headers;
}

/**
 * A required column's exported header carries the same " *" marker the
 * template uses (xlsx-export.ts's buildWorkbook) — strip it back off before
 * matching, exactly like `parseWorkbook` itself does, so this test asserts
 * the same thing the real upload path actually checks.
 */
function stripRequiredMarker(header: string): string {
  return header.endsWith(REQUIRED_HEADER_SUFFIX) ? header.slice(0, -REQUIRED_HEADER_SUFFIX.length) : header;
}

function assertHeadersCovered(exportHeaders: string[], importColumns: ImportColumn[]) {
  const lower = new Set(exportHeaders.map((h) => stripRequiredMarker(h).toLowerCase()));
  const missing = importColumns.map((c) => c.header).filter((h) => !lower.has(h.toLowerCase()));
  expect(missing).toEqual([]);
}

/** Every required import column's exported header is actually marked "*" — the whole point of this session's follow-up fix (a user editing the exported sheet needs the same warning the blank template already gives). */
function assertRequiredColumnsMarked(exportHeaders: string[], importColumns: ImportColumn[]) {
  const starred = new Set(
    exportHeaders.filter((h) => h.endsWith(REQUIRED_HEADER_SUFFIX)).map((h) => stripRequiredMarker(h).toLowerCase()),
  );
  const unmarked = importColumns.filter((c) => c.required).map((c) => c.header).filter((h) => !starred.has(h.toLowerCase()));
  expect(unmarked).toEqual([]);
}

describe('export -> import column parity', () => {
  it('Client: exportAll headers cover every CLIENT_IMPORT_COLUMNS header', async () => {
    const client = {
      id: 'c1',
      displayId: 'CLI-000001',
      companyName: 'Acme',
      industry: null,
      specialization: null,
      locations: [],
      status: 'COLD',
      quality: 'MEDIUM',
      website: null,
      seekJobMarketUrl: null,
      linkedinJobMarketUrl: null,
      generalDescription: null,
      lastContactedAt: null,
      stakeholders: [],
    };
    const prisma = { client: { findMany: jest.fn().mockResolvedValue([client]) } } as unknown as ConstructorParameters<typeof ClientsService>[0];
    const base = {
      location: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as ConstructorParameters<typeof ClientsService>[1];
    const service = new ClientsService(prisma, base);
    const buffer = await service.exportAll({ sortOrder: 'asc' } as never, makeUser());
    const headers = await headerRow(buffer);
    assertHeadersCovered(headers, CLIENT_IMPORT_COLUMNS);
    assertRequiredColumnsMarked(headers, CLIENT_IMPORT_COLUMNS);
  });

  it('Stakeholder: exportAll headers cover every STAKEHOLDER_IMPORT_COLUMNS header', async () => {
    const stakeholder = {
      id: 's1',
      displayId: 'STK-000001',
      client: null,
      firstName: null,
      lastName: null,
      jobTitle: null,
      stakeholderRoleType: null,
      linkedinUrl: null,
      email: null,
      mobile: null,
      coverage: [],
      status: 'COLD',
      isAccurate: null,
      inaccurateReason: null,
      contactHistory: [],
    };
    const prisma = { stakeholder: { findMany: jest.fn().mockResolvedValue([stakeholder]) } } as unknown as ConstructorParameters<typeof StakeholdersService>[0];
    const base = {
      location: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as ConstructorParameters<typeof StakeholdersService>[1];
    const service = new StakeholdersService(prisma, base);
    const buffer = await service.exportAll({ sortOrder: 'asc' } as never, makeUser());
    const headers = await headerRow(buffer);
    assertHeadersCovered(headers, STAKEHOLDER_IMPORT_COLUMNS);
    assertRequiredColumnsMarked(headers, STAKEHOLDER_IMPORT_COLUMNS);
  });

  it('Candidate: exportAll headers cover every CANDIDATE_IMPORT_COLUMNS header', async () => {
    const candidate = {
      id: 'cd1',
      displayId: 'CDD-000001',
      firstName: null,
      lastName: null,
      email: null,
      mobile: null,
      currentRole: null,
      currentCompany: null,
      linkedinUrl: null,
      seekTalentUrl: null,
      rawResumeUrl: null,
      editedResumeUrl: null,
      status: 'COLD',
      contactHistory: [],
      industry: null,
      jobRoleType: null,
      location: null,
      specializations: [],
    };
    const prisma = { candidate: { findMany: jest.fn().mockResolvedValue([candidate]) } } as unknown as ConstructorParameters<typeof CandidatesService>[0];
    const base = {
      location: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as ConstructorParameters<typeof CandidatesService>[1];
    const service = new CandidatesService(prisma, base);
    const buffer = await service.exportAll({ sortOrder: 'asc' } as never, makeUser());
    const headers = await headerRow(buffer);
    assertHeadersCovered(headers, CANDIDATE_IMPORT_COLUMNS);
    assertRequiredColumnsMarked(headers, CANDIDATE_IMPORT_COLUMNS);
  });

  it('Job Order: exportAll headers cover every JOB_ORDER_IMPORT_COLUMNS header', async () => {
    const jobOrder = {
      id: 'jo1',
      displayId: 'JO-000001',
      client: null,
      consultants: [],
      jobTitle: null,
      jobRoleType: null,
      location: null,
      status: 'ACTIVE',
      quality: 'MEDIUM',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      estimatedValue: null,
      openings: 1,
      filledCount: 0,
      description: null,
      requirements: null,
      notes: null,
      receivedAt: new Date(),
      closedAt: null,
      submissions: [],
    };
    const prisma = { jobOrder: { findMany: jest.fn().mockResolvedValue([jobOrder]) } } as unknown as ConstructorParameters<typeof JobOrdersService>[0];
    const base = {
      location: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as ConstructorParameters<typeof JobOrdersService>[1];
    const service = new JobOrdersService(prisma, base);
    const buffer = await service.exportAll({ sortOrder: 'asc' } as never, makeUser());
    const headers = await headerRow(buffer);
    assertHeadersCovered(headers, JOB_ORDER_IMPORT_COLUMNS);
    assertRequiredColumnsMarked(headers, JOB_ORDER_IMPORT_COLUMNS);
  });

  it('Job Research: exportAll headers cover every JOB_RESEARCH_IMPORT_COLUMNS header', async () => {
    const research = {
      id: 'jr1',
      displayId: 'JR-000001',
      client: null,
      consultant: null,
      jobTitle: null,
      jobRoleType: null,
      location: null,
      status: null,
      seekUrl: null,
      permanentUrl: null,
      postedDate: null,
      contactEmailFromAd: null,
      salaryRange: null,
      isContacted: false,
      researchedAt: new Date(),
      lastContactedAt: null,
      notes: null,
      jobOrder: null,
    };
    const prisma = { clientJobResearch: { findMany: jest.fn().mockResolvedValue([research]) } } as unknown as ConstructorParameters<typeof JobResearchService>[0];
    const base = {
      location: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as ConstructorParameters<typeof JobResearchService>[1];
    const service = new JobResearchService(prisma, base);
    const buffer = await service.exportAll({ sortOrder: 'asc' } as never, makeUser());
    const headers = await headerRow(buffer);
    assertHeadersCovered(headers, JOB_RESEARCH_IMPORT_COLUMNS);
    assertRequiredColumnsMarked(headers, JOB_RESEARCH_IMPORT_COLUMNS);
  });
});
