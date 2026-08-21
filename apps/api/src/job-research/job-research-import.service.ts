import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ClientStatus, Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import { EXTENDED_PRISMA } from '../prisma/extended-prisma.provider';
import { ExtendedPrismaClient, computeChanges, toJson } from '../prisma/prisma.extensions';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/request-context';
import { ImportResultEntity } from '../common/entities/import-result.entity';
import {
  ImportColumn,
  ImportRowError,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  buildLocationPathIndex,
  buildLocationReferenceSheet,
  buildNameReferenceSheet,
  buildTemplateWorkbook,
  chunk,
  findInFileDuplicates,
  parseWorkbook,
} from '../common/xlsx-import';

export const JOB_RESEARCH_IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'Display ID', key: 'displayId' },
  {
    header: 'Client Display ID',
    key: 'clientDisplayId',
    required: true,
    dropdown: { kind: 'reference', sheetTitle: 'Companies', columnKey: 'displayId' },
  },
  {
    header: 'Consultant Display ID',
    key: 'consultantDisplayId',
    dropdown: { kind: 'reference', sheetTitle: 'Consultants', columnKey: 'displayId' },
  },
  { header: 'Location', key: 'location', dropdown: { kind: 'reference', sheetTitle: 'Locations', columnKey: 'path' } },
  { header: 'Job Title', key: 'jobTitle', dropdown: { kind: 'reference', sheetTitle: 'Job Titles', columnKey: 'name' } },
  {
    header: 'Job Role Type',
    key: 'jobRoleType',
    dropdown: { kind: 'reference', sheetTitle: 'Job Role Types', columnKey: 'name' },
  },
  { header: 'Status', key: 'status', dropdown: { kind: 'inline', values: ['COLD', 'WARM', 'TRADED'] } },
  { header: 'Seek URL', key: 'seekUrl' },
  { header: 'Permanent URL', key: 'permanentUrl' },
  { header: 'Posted Date', key: 'postedDate' },
  { header: 'Contact Email', key: 'contactEmailFromAd' },
  { header: 'Salary Range', key: 'salaryRange' },
  { header: 'Is Contacted', key: 'isContacted', required: true, dropdown: { kind: 'inline', values: ['Yes', 'No'] } },
  { header: 'Notes', key: 'notes' },
];

const JOB_RESEARCH_IMPORT_INSTRUCTIONS = [
  'Client Display ID must exactly match an existing company\'s Display ID — required on every row, including new ones (research always belongs to a company). We can\'t match by company name instead: names aren\'t guaranteed unique in this system.',
  'Consultant Display ID (who conducted the research) is optional, but if provided must exactly match an existing consultant\'s Display ID — leave it blank rather than guessing.',
  'Job Title and Job Role Type are grown freely (same as typing a new one into either combobox in the app) — an unmatched value creates it rather than being rejected.',
  'Location: a single breadcrumb path, e.g. "Australia > New South Wales > Sydney". Optional.',
  'Status is a snapshot of the company\'s status when the ad was logged (COLD, WARM, or TRADED) — not a live reference to the company\'s current status. Optional; blank clears it.',
  'Is Contacted: Yes or No, required on every row so a bulk import can never silently reset it. Posted Date: an ISO date (e.g. 2026-08-01).',
  'Not included in this template: Researched At (defaults to the moment of import for new rows, and is left unchanged when updating — a log timestamp, not editable data), and Last Contacted At/By plus the linked Job Order, both of which are set only through their own dedicated actions in the app.',
];

type JobResearchRowPlan =
  | {
      kind: 'insert';
      data: Prisma.ClientJobResearchUncheckedCreateInput;
      jobTitle: string | null;
      jobRoleType: string | null;
    }
  | {
      kind: 'update';
      existingId: string;
      data: Prisma.ClientJobResearchUncheckedUpdateInput;
      jobTitle: string | null;
      jobRoleType: string | null;
    };

function matchEnum<T extends string>(values: readonly T[], input: string): T | undefined {
  return values.find((v) => v.toLowerCase() === input.toLowerCase());
}

function parseYesNo(value: string): boolean | undefined {
  const v = value.toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return undefined;
}

/** A parseable date, or undefined for anything unparseable. */
function parseDate(value: string): Date | undefined {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Backs `GET /job-research/import/template` and `POST /job-research/import`.
 * Same shape as the other four import services — see ClientsImportService's
 * doc for the shared write-side reasoning (base client, transaction-local
 * audit rows) and JobOrdersImportService's doc for the growable-catalog (Job
 * Title, Job Role Type) auto-create-at-commit-time pattern, reused here
 * unchanged.
 *
 * Consultant Display ID is the one reference this template has that none of
 * the other four do: Consultant isn't a growable catalog (it's RBAC/identity,
 * not a combobox), so — like Client Display ID — an unmatched value is always
 * a row error, resolved synchronously during `validate()` rather than carried
 * through to commit time for an upsert.
 */
@Injectable()
export class JobResearchImportService {
  constructor(
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    private readonly base: PrismaService,
  ) {}

  /**
   * Client Display ID is required on every row, including brand-new ones —
   * a Companies reference sheet is bundled into the workbook so that's a
   * lookup inside the file itself, not a separate Export download. Same for
   * Consultants.
   */
  async buildTemplate(): Promise<Buffer> {
    const [clients, consultants, jobTitles, jobRoleTypes, locations] = await Promise.all([
      this.prisma.client.findMany({
        select: { displayId: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      this.base.consultant.findMany({
        where: { isActive: true },
        select: { displayId: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      this.base.jobTitle.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.jobRoleType.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true, level: true } }),
    ]);
    return buildTemplateWorkbook('Job Research', JOB_RESEARCH_IMPORT_COLUMNS, JOB_RESEARCH_IMPORT_INSTRUCTIONS, [
      {
        title: 'Companies',
        columns: [
          { header: 'Display ID', key: 'displayId' },
          { header: 'Company Name', key: 'companyName' },
        ],
        rows: clients,
      },
      {
        title: 'Consultants',
        columns: [
          { header: 'Display ID', key: 'displayId' },
          { header: 'Full Name', key: 'fullName' },
        ],
        rows: consultants,
      },
      buildNameReferenceSheet('Job Titles', jobTitles),
      buildNameReferenceSheet('Job Role Types', jobRoleTypes),
      buildLocationReferenceSheet(locations),
    ]);
  }

  async validate(buffer: Buffer): Promise<{ errors: ImportRowError[]; plans: JobResearchRowPlan[]; totalRows: number }> {
    if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB limit.`,
      });
    }

    const { rows, headerErrors } = await parseWorkbook(buffer, JOB_RESEARCH_IMPORT_COLUMNS);
    if (headerErrors.length > 0) {
      return { errors: headerErrors.map((message) => ({ row: 1, column: '(header)', message })), plans: [], totalRows: 0 };
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException({
        code: 'TOO_MANY_ROWS',
        message: `File has ${rows.length} data rows; the limit is ${MAX_IMPORT_ROWS}.`,
      });
    }

    const errors: ImportRowError[] = findInFileDuplicates(
      rows.map((r) => ({ rowNumber: r.rowNumber, displayId: r.cells.displayId })),
    );

    // Consultants are matched regardless of isActive — a since-deactivated
    // consultant can still be the true, historically accurate author of an
    // old research row. (buildTemplate's own reference sheet only *lists*
    // active ones, since that's what a user picking a name today should see.)
    const [clients, consultants, locations, existingResearch] = await Promise.all([
      this.prisma.client.findMany({ select: { id: true, displayId: true } }),
      this.base.consultant.findMany({ select: { id: true, displayId: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true } }),
      this.prisma.clientJobResearch.findMany({ select: { id: true, displayId: true } }),
    ]);

    const clientIdByDisplayId = new Map(clients.map((c) => [c.displayId, c.id]));
    const consultantIdByDisplayId = new Map(consultants.map((c) => [c.displayId, c.id]));
    const locationIndex = buildLocationPathIndex(locations);
    const researchIdByDisplayId = new Map(existingResearch.map((r) => [r.displayId, r.id]));

    const duplicateRowNumbers = new Set(errors.map((e) => e.row));
    const plans: JobResearchRowPlan[] = [];

    for (const row of rows) {
      if (duplicateRowNumbers.has(row.rowNumber)) continue;
      const rowErrors: ImportRowError[] = [];
      const c = row.cells;

      let existingId: string | undefined;
      if (c.displayId) {
        existingId = researchIdByDisplayId.get(c.displayId);
        if (!existingId) {
          rowErrors.push({
            row: row.rowNumber,
            column: 'Display ID',
            message: `No existing research row with Display ID "${c.displayId}" — leave it blank to create a new one.`,
          });
        }
      }
      const isUpdate = existingId != null;

      for (const col of JOB_RESEARCH_IMPORT_COLUMNS) {
        if (col.required && !c[col.key]) {
          rowErrors.push({ row: row.rowNumber, column: col.header, message: `${col.header} is required.` });
        }
      }

      let clientId: string | undefined;
      if (c.clientDisplayId) {
        clientId = clientIdByDisplayId.get(c.clientDisplayId);
        if (!clientId) {
          rowErrors.push({
            row: row.rowNumber,
            column: 'Client Display ID',
            message: `No existing company with Display ID "${c.clientDisplayId}".`,
          });
        }
      }

      let consultantId: string | undefined;
      if (c.consultantDisplayId) {
        consultantId = consultantIdByDisplayId.get(c.consultantDisplayId);
        if (!consultantId) {
          rowErrors.push({
            row: row.rowNumber,
            column: 'Consultant Display ID',
            message: `No existing consultant with Display ID "${c.consultantDisplayId}".`,
          });
        }
      }

      let locationId: string | undefined;
      if (c.location) {
        locationId = locationIndex.get(c.location.toLowerCase());
        if (!locationId) rowErrors.push({ row: row.rowNumber, column: 'Location', message: `Unknown location "${c.location}".` });
      }

      const status = c.status ? matchEnum(Object.values(ClientStatus), c.status) : undefined;
      if (c.status && !status) {
        rowErrors.push({ row: row.rowNumber, column: 'Status', message: `"${c.status}" isn't a valid status (COLD, WARM, TRADED).` });
      }

      if (c.seekUrl && c.seekUrl.length > 2000) {
        rowErrors.push({ row: row.rowNumber, column: 'Seek URL', message: 'Must be 2000 characters or fewer.' });
      }
      if (c.permanentUrl && c.permanentUrl.length > 2000) {
        rowErrors.push({ row: row.rowNumber, column: 'Permanent URL', message: 'Must be 2000 characters or fewer.' });
      }

      let postedDate: Date | undefined;
      if (c.postedDate) {
        postedDate = parseDate(c.postedDate);
        if (!postedDate) rowErrors.push({ row: row.rowNumber, column: 'Posted Date', message: `"${c.postedDate}" isn't a valid date.` });
      }

      if (c.contactEmailFromAd && !isEmail(c.contactEmailFromAd)) {
        rowErrors.push({ row: row.rowNumber, column: 'Contact Email', message: `"${c.contactEmailFromAd}" isn't a valid email address.` });
      }

      if (c.salaryRange && c.salaryRange.length > 500) {
        rowErrors.push({ row: row.rowNumber, column: 'Salary Range', message: 'Must be 500 characters or fewer.' });
      }

      let isContacted: boolean | undefined;
      if (c.isContacted) {
        isContacted = parseYesNo(c.isContacted);
        if (isContacted === undefined) {
          rowErrors.push({ row: row.rowNumber, column: 'Is Contacted', message: `"${c.isContacted}" must be Yes or No.` });
        }
      }

      if (c.notes && c.notes.length > 5000) {
        rowErrors.push({ row: row.rowNumber, column: 'Notes', message: 'Must be 5000 characters or fewer.' });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      const jobTitle = c.jobTitle || null;
      const jobRoleType = c.jobRoleType || null;

      if (isUpdate) {
        const data: Prisma.ClientJobResearchUncheckedUpdateInput = {
          clientId: clientId!,
          consultantId: consultantId ?? null,
          locationId: locationId ?? null,
          status: status ?? null,
          seekUrl: c.seekUrl || null,
          permanentUrl: c.permanentUrl || null,
          postedDate: postedDate ?? null,
          contactEmailFromAd: c.contactEmailFromAd || null,
          salaryRange: c.salaryRange || null,
          isContacted: isContacted!,
          notes: c.notes || null,
        };
        plans.push({ kind: 'update', existingId: existingId!, data, jobTitle, jobRoleType });
      } else {
        const data: Prisma.ClientJobResearchUncheckedCreateInput = {
          clientId: clientId!,
          isContacted: isContacted!,
          ...(consultantId ? { consultantId } : {}),
          ...(locationId ? { locationId } : {}),
          ...(status ? { status } : {}),
          ...(c.seekUrl ? { seekUrl: c.seekUrl } : {}),
          ...(c.permanentUrl ? { permanentUrl: c.permanentUrl } : {}),
          ...(postedDate ? { postedDate } : {}),
          ...(c.contactEmailFromAd ? { contactEmailFromAd: c.contactEmailFromAd } : {}),
          ...(c.salaryRange ? { salaryRange: c.salaryRange } : {}),
          ...(c.notes ? { notes: c.notes } : {}),
        };
        plans.push({ kind: 'insert', data, jobTitle, jobRoleType });
      }
    }

    return { errors, plans, totalRows: rows.length };
  }

  async importFromWorkbook(buffer: Buffer, commit: boolean, fileName: string | undefined): Promise<ImportResultEntity> {
    const { errors, plans, totalRows } = await this.validate(buffer);
    const insertCount = plans.filter((p) => p.kind === 'insert').length;
    const updateCount = plans.filter((p) => p.kind === 'update').length;

    if (errors.length > 0 || !commit) {
      return { totalRows, insertCount, updateCount, errors, committed: false };
    }

    const actorId = RequestContext.getActorId() ?? null;
    const requestId = RequestContext.getRequestId();
    const metadata = { source: 'import', requestId, fileName } as Prisma.InputJsonValue;

    for (const rowsChunk of chunk(plans, 100)) {
      await this.base.$transaction(async (tx) => {
        for (const plan of rowsChunk) {
          const jobTitleId = plan.jobTitle
            ? (await tx.jobTitle.upsert({ where: { name: plan.jobTitle }, create: { name: plan.jobTitle }, update: {} })).id
            : plan.kind === 'update'
              ? null
              : undefined;
          const jobRoleTypeId = plan.jobRoleType
            ? (await tx.jobRoleType.upsert({ where: { name: plan.jobRoleType }, create: { name: plan.jobRoleType }, update: {} })).id
            : plan.kind === 'update'
              ? null
              : undefined;

          if (plan.kind === 'insert') {
            const created = await tx.clientJobResearch.create({
              data: { ...plan.data, ...(jobTitleId ? { jobTitleId } : {}), ...(jobRoleTypeId ? { jobRoleTypeId } : {}) },
            });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'CREATE',
                entityType: 'ClientJobResearch',
                entityId: created.id,
                changes: toJson(created) as Prisma.InputJsonValue,
                metadata,
              },
            });
          } else {
            const before = await tx.clientJobResearch.findUnique({ where: { id: plan.existingId } });
            const data = { ...plan.data, jobTitleId, jobRoleTypeId };
            const updated = await tx.clientJobResearch.update({ where: { id: plan.existingId }, data });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'UPDATE',
                entityType: 'ClientJobResearch',
                entityId: updated.id,
                changes: computeChanges(before, data) as Prisma.InputJsonValue,
                metadata,
              },
            });
          }
        }
      });
    }

    return { totalRows, insertCount, updateCount, errors: [], committed: true };
  }
}
