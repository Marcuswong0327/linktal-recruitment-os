import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JobOrderQuality, JobOrderStatus, Prisma } from '@prisma/client';
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

export const JOB_ORDER_IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'Display ID', key: 'displayId' },
  {
    header: 'Client Display ID',
    key: 'clientDisplayId',
    required: true,
    dropdown: { kind: 'reference', sheetTitle: 'Companies', columnKey: 'displayId' },
  },
  { header: 'Job Title', key: 'jobTitle', dropdown: { kind: 'reference', sheetTitle: 'Job Titles', columnKey: 'name' } },
  {
    header: 'Job Role Type',
    key: 'jobRoleType',
    dropdown: { kind: 'reference', sheetTitle: 'Job Role Types', columnKey: 'name' },
  },
  { header: 'Location', key: 'location', dropdown: { kind: 'reference', sheetTitle: 'Locations', columnKey: 'name' } },
  { header: 'Salary Min', key: 'salaryMin' },
  { header: 'Salary Max', key: 'salaryMax' },
  { header: 'Salary Currency', key: 'salaryCurrency' },
  { header: 'Estimated Value', key: 'estimatedValue' },
  { header: 'Openings', key: 'openings', required: true },
  { header: 'Description', key: 'description' },
  { header: 'Requirements', key: 'requirements' },
  { header: 'Notes', key: 'notes' },
  { header: 'Status', key: 'status', required: true, dropdown: { kind: 'inline', values: ['ACTIVE', 'PLACED', 'CLOSED', 'ON_HOLD'] } },
  { header: 'Quality', key: 'quality', required: true, dropdown: { kind: 'inline', values: ['LOW', 'MEDIUM', 'HIGH'] } },
];

const JOB_ORDER_IMPORT_INSTRUCTIONS = [
  'Client Display ID must exactly match an existing company\'s Display ID — required on every row, including new ones (a job order always belongs to a company). We can\'t match by company name instead: names aren\'t guaranteed unique in this system.',
  'Job Title and Role Type are grown freely (same as typing a new one into either combobox in the app) — an unmatched value creates it rather than being rejected.',
  'Location: a single Country or City Coverage value from the Locations sheet, e.g. "Brisbane GC QLD". Optional.',
  'Openings: a whole number, 1 or more.',
  'Status: ACTIVE, PLACED, CLOSED, or ON_HOLD. Quality: LOW, MEDIUM, or HIGH.',
  'Not included in this template: Consultants (assign these from the Job Order\'s own page after import — it has its own dedicated multi-assignee control), and the derived Filled/Received/Closed fields.',
];

type JobOrderRowPlan =
  | {
      kind: 'insert';
      data: Prisma.JobOrderUncheckedCreateInput;
      jobTitle: string | null;
      jobRoleType: string | null;
    }
  | {
      kind: 'update';
      existingId: string;
      data: Prisma.JobOrderUncheckedUpdateInput;
      jobTitle: string | null;
      jobRoleType: string | null;
    };

function matchEnum<T extends string>(values: readonly T[], input: string): T | undefined {
  return values.find((v) => v.toLowerCase() === input.toLowerCase());
}

/** A whole number, or undefined for anything else (blank, non-numeric, fractional). */
function parseWholeNumber(value: string): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

/** A finite number ≥ 0, or undefined otherwise. */
function parseNonNegativeNumber(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Backs `GET /job-orders/import/template` and `POST /job-orders/import`.
 * Same shape as the other three import services — see ClientsImportService's
 * doc for the shared write-side reasoning (base client, transaction-local
 * audit rows) and StakeholdersImportService's doc for the growable-catalog
 * (Job Title, Job Role Type) auto-create-at-commit-time pattern, reused here
 * unchanged. Unlike Stakeholder, a blank Job Role Type here just clears it —
 * JobOrder has no title-based auto-classifier the live create/update
 * endpoints call either.
 */
@Injectable()
export class JobOrdersImportService {
  constructor(
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    private readonly base: PrismaService,
  ) {}

  /**
   * Client Display ID is required on every row, including brand-new ones —
   * a Companies reference sheet is bundled into the workbook so that's a
   * lookup inside the file itself, not a separate Export download.
   */
  async buildTemplate(): Promise<Buffer> {
    const [clients, jobTitles, jobRoleTypes, locations] = await Promise.all([
      this.prisma.client.findMany({
        select: { displayId: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      this.base.jobTitle.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.jobRoleType.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true, level: true, parentId: true } }),
    ]);
    return buildTemplateWorkbook('Job Orders', JOB_ORDER_IMPORT_COLUMNS, JOB_ORDER_IMPORT_INSTRUCTIONS, [
      {
        title: 'Companies',
        columns: [
          { header: 'Display ID', key: 'displayId' },
          { header: 'Company Name', key: 'companyName' },
        ],
        rows: clients,
      },
      buildNameReferenceSheet('Job Titles', jobTitles),
      buildNameReferenceSheet('Job Role Types', jobRoleTypes),
      buildLocationReferenceSheet(locations),
    ]);
  }

  async validate(buffer: Buffer): Promise<{ errors: ImportRowError[]; plans: JobOrderRowPlan[]; totalRows: number }> {
    if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB limit.`,
      });
    }

    const { rows, headerErrors } = await parseWorkbook(buffer, JOB_ORDER_IMPORT_COLUMNS);
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

    const [clients, locations, existingJobOrders] = await Promise.all([
      this.prisma.client.findMany({ select: { id: true, displayId: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true } }),
      this.prisma.jobOrder.findMany({ select: { id: true, displayId: true } }),
    ]);

    const clientIdByDisplayId = new Map(clients.map((c) => [c.displayId, c.id]));
    const locationIndex = buildLocationPathIndex(locations);
    const jobOrderIdByDisplayId = new Map(existingJobOrders.map((j) => [j.displayId, j.id]));

    const duplicateRowNumbers = new Set(errors.map((e) => e.row));
    const plans: JobOrderRowPlan[] = [];

    for (const row of rows) {
      if (duplicateRowNumbers.has(row.rowNumber)) continue;
      const rowErrors: ImportRowError[] = [];
      const c = row.cells;

      let existingId: string | undefined;
      if (c.displayId) {
        existingId = jobOrderIdByDisplayId.get(c.displayId);
        if (!existingId) {
          rowErrors.push({
            row: row.rowNumber,
            column: 'Display ID',
            message: `No existing job order with Display ID "${c.displayId}" — leave it blank to create a new one.`,
          });
        }
      }
      const isUpdate = existingId != null;

      for (const col of JOB_ORDER_IMPORT_COLUMNS) {
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

      let locationId: string | undefined;
      if (c.location) {
        locationId = locationIndex.get(c.location.toLowerCase());
        if (!locationId) rowErrors.push({ row: row.rowNumber, column: 'Location', message: `Unknown location "${c.location}".` });
      }

      let salaryMin: number | undefined;
      if (c.salaryMin) {
        salaryMin = parseNonNegativeNumber(c.salaryMin);
        if (salaryMin === undefined) rowErrors.push({ row: row.rowNumber, column: 'Salary Min', message: `"${c.salaryMin}" must be a number ≥ 0.` });
      }
      let salaryMax: number | undefined;
      if (c.salaryMax) {
        salaryMax = parseNonNegativeNumber(c.salaryMax);
        if (salaryMax === undefined) rowErrors.push({ row: row.rowNumber, column: 'Salary Max', message: `"${c.salaryMax}" must be a number ≥ 0.` });
      }
      let estimatedValue: number | undefined;
      if (c.estimatedValue) {
        estimatedValue = parseNonNegativeNumber(c.estimatedValue);
        if (estimatedValue === undefined) rowErrors.push({ row: row.rowNumber, column: 'Estimated Value', message: `"${c.estimatedValue}" must be a number ≥ 0.` });
      }

      let openings: number | undefined;
      if (c.openings) {
        openings = parseWholeNumber(c.openings);
        if (openings === undefined || openings < 1) {
          rowErrors.push({ row: row.rowNumber, column: 'Openings', message: `"${c.openings}" must be a whole number of 1 or more.` });
          openings = undefined;
        }
      }

      const status = c.status ? matchEnum(Object.values(JobOrderStatus), c.status) : undefined;
      if (c.status && !status) {
        rowErrors.push({ row: row.rowNumber, column: 'Status', message: `"${c.status}" isn't a valid status (ACTIVE, PLACED, CLOSED, ON_HOLD).` });
      }
      const quality = c.quality ? matchEnum(Object.values(JobOrderQuality), c.quality) : undefined;
      if (c.quality && !quality) {
        rowErrors.push({ row: row.rowNumber, column: 'Quality', message: `"${c.quality}" isn't a valid quality (LOW, MEDIUM, HIGH).` });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      const jobTitle = c.jobTitle || null;
      const jobRoleType = c.jobRoleType || null;

      if (isUpdate) {
        const data: Prisma.JobOrderUncheckedUpdateInput = {
          clientId: clientId!,
          locationId: locationId ?? null,
          salaryMin: salaryMin ?? null,
          salaryMax: salaryMax ?? null,
          salaryCurrency: c.salaryCurrency || null,
          estimatedValue: estimatedValue ?? null,
          openings: openings!,
          description: c.description || null,
          requirements: c.requirements || null,
          notes: c.notes || null,
          status: status!,
          quality: quality!,
        };
        plans.push({ kind: 'update', existingId: existingId!, data, jobTitle, jobRoleType });
      } else {
        const data: Prisma.JobOrderUncheckedCreateInput = {
          clientId: clientId!,
          openings: openings!,
          status: status!,
          quality: quality!,
          ...(locationId ? { locationId } : {}),
          ...(salaryMin !== undefined ? { salaryMin } : {}),
          ...(salaryMax !== undefined ? { salaryMax } : {}),
          ...(c.salaryCurrency ? { salaryCurrency: c.salaryCurrency } : {}),
          ...(estimatedValue !== undefined ? { estimatedValue } : {}),
          ...(c.description ? { description: c.description } : {}),
          ...(c.requirements ? { requirements: c.requirements } : {}),
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
            const created = await tx.jobOrder.create({
              data: { ...plan.data, ...(jobTitleId ? { jobTitleId } : {}), ...(jobRoleTypeId ? { jobRoleTypeId } : {}) },
            });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'CREATE',
                entityType: 'JobOrder',
                entityId: created.id,
                changes: toJson(created) as Prisma.InputJsonValue,
                metadata,
              },
            });
          } else {
            const before = await tx.jobOrder.findUnique({ where: { id: plan.existingId } });
            const data = { ...plan.data, jobTitleId, jobRoleTypeId };
            const updated = await tx.jobOrder.update({ where: { id: plan.existingId }, data });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'UPDATE',
                entityType: 'JobOrder',
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
