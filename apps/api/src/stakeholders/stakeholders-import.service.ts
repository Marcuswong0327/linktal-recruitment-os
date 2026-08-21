import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isEmail, isURL } from 'class-validator';
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
import { classifyRoleTypeId } from './stakeholders.service';

export const STAKEHOLDER_IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'Display ID', key: 'displayId' },
  {
    header: 'Client Display ID',
    key: 'clientDisplayId',
    required: true,
    dropdown: { kind: 'reference', sheetTitle: 'Companies', columnKey: 'displayId' },
  },
  { header: 'First Name', key: 'firstName' },
  { header: 'Last Name', key: 'lastName' },
  { header: 'Job Title', key: 'jobTitle', dropdown: { kind: 'reference', sheetTitle: 'Job Titles', columnKey: 'name' } },
  {
    header: 'Role Type',
    key: 'roleType',
    dropdown: { kind: 'reference', sheetTitle: 'Stakeholder Role Types', columnKey: 'name' },
  },
  { header: 'LinkedIn URL', key: 'linkedinUrl' },
  { header: 'Email', key: 'email' },
  { header: 'Mobile', key: 'mobile' },
  // Multi-value (semicolon-separated) — deliberately no dropdown, same
  // reasoning as Client's Locations.
  { header: 'Coverage Locations', key: 'coverageLocations' },
  { header: 'Details Accurate', key: 'isAccurate', dropdown: { kind: 'inline', values: ['Yes', 'No'] } },
  { header: 'Inaccurate Reason', key: 'inaccurateReason' },
];

const STAKEHOLDER_IMPORT_INSTRUCTIONS = [
  'Client Display ID must exactly match an existing company\'s Display ID — required on every row, including new ones (a stakeholder always belongs to a company). We can\'t match by company name instead: names aren\'t guaranteed unique in this system.',
  'Job Title and Role Type are grown freely (same as typing a new one into either combobox in the app) — an unmatched value creates it rather than being rejected. Leave Role Type blank to auto-classify it from Job Title, the same way the app does when you don\'t set one explicitly.',
  'Coverage Locations: semicolon-separated breadcrumb paths, e.g. "Australia > New South Wales > Sydney". Optional — independent of the company\'s own location.',
  'Details Accurate: Yes, No, or blank (not yet checked).',
];

// Raw jobTitle/roleType cell text on both variants — resolved to an id only
// at commit time (auto-create must never happen during a commit=false
// preview). Empty string normalized to null.
type StakeholderRowPlan =
  | {
      kind: 'insert';
      data: Prisma.StakeholderUncheckedCreateInput;
      coverageLocationIds: string[];
      jobTitle: string | null;
      roleType: string | null;
    }
  | {
      kind: 'update';
      existingId: string;
      data: Prisma.StakeholderUncheckedUpdateInput;
      coverageLocationIds: string[];
      jobTitle: string | null;
      roleType: string | null;
    };

function parseYesNo(value: string): boolean | undefined {
  const v = value.toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return undefined;
}

/**
 * Backs `GET /stakeholders/import/template` and `POST /stakeholders/import`.
 * Same read/write split and all-or-nothing commit shape as
 * ClientsImportService — see its doc for why writes run on `base` inside
 * `$transaction` rather than the audited/extended client.
 *
 * Job Title and Role Type are the one place this diverges from a plain
 * "resolve or reject" column: both are combobox-growable catalogs (unlike
 * Client's Industry/Specialization), so an unmatched name is never a
 * validation error — it's just created at commit time, exactly like typing a
 * new one into either picker in the live app already does. That auto-create
 * deliberately never happens during `validate()` itself (a preview must
 * write nothing at all), so a row's plan carries the raw name text through
 * to the commit transaction instead of a resolved id.
 */
@Injectable()
export class StakeholdersImportService {
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
    const [clients, jobTitles, roleTypes, locations] = await Promise.all([
      this.prisma.client.findMany({
        select: { displayId: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      this.base.jobTitle.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.stakeholderRoleType.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true, level: true } }),
    ]);
    return buildTemplateWorkbook('Stakeholders', STAKEHOLDER_IMPORT_COLUMNS, STAKEHOLDER_IMPORT_INSTRUCTIONS, [
      {
        title: 'Companies',
        columns: [
          { header: 'Display ID', key: 'displayId' },
          { header: 'Company Name', key: 'companyName' },
        ],
        rows: clients,
      },
      buildNameReferenceSheet('Job Titles', jobTitles),
      buildNameReferenceSheet('Stakeholder Role Types', roleTypes),
      buildLocationReferenceSheet(locations),
    ]);
  }

  async validate(buffer: Buffer): Promise<{ errors: ImportRowError[]; plans: StakeholderRowPlan[]; totalRows: number }> {
    if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB limit.`,
      });
    }

    const { rows, headerErrors } = await parseWorkbook(buffer, STAKEHOLDER_IMPORT_COLUMNS);
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

    const [clients, locations, existingStakeholders] = await Promise.all([
      // Extended client: a soft-deleted company can't be a valid target either.
      this.prisma.client.findMany({ select: { id: true, displayId: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true } }),
      this.prisma.stakeholder.findMany({ select: { id: true, displayId: true } }),
    ]);

    const clientIdByDisplayId = new Map(clients.map((c) => [c.displayId, c.id]));
    const locationIndex = buildLocationPathIndex(locations);
    const stakeholderIdByDisplayId = new Map(existingStakeholders.map((s) => [s.displayId, s.id]));

    const duplicateRowNumbers = new Set(errors.map((e) => e.row));
    const plans: StakeholderRowPlan[] = [];

    for (const row of rows) {
      if (duplicateRowNumbers.has(row.rowNumber)) continue;
      const rowErrors: ImportRowError[] = [];
      const c = row.cells;

      let existingId: string | undefined;
      if (c.displayId) {
        existingId = stakeholderIdByDisplayId.get(c.displayId);
        if (!existingId) {
          rowErrors.push({
            row: row.rowNumber,
            column: 'Display ID',
            message: `No existing stakeholder with Display ID "${c.displayId}" — leave it blank to create a new one.`,
          });
        }
      }
      const isUpdate = existingId != null;

      for (const col of STAKEHOLDER_IMPORT_COLUMNS) {
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

      const coverageLocationIds: string[] = [];
      if (c.coverageLocations) {
        for (const path of c.coverageLocations.split(';').map((p) => p.trim()).filter(Boolean)) {
          const id = locationIndex.get(path.toLowerCase());
          if (id) coverageLocationIds.push(id);
          else rowErrors.push({ row: row.rowNumber, column: 'Coverage Locations', message: `Unknown location "${path}".` });
        }
      }

      if (c.linkedinUrl && !isURL(c.linkedinUrl)) {
        rowErrors.push({ row: row.rowNumber, column: 'LinkedIn URL', message: `"${c.linkedinUrl}" isn't a valid URL.` });
      }
      if (c.email && !isEmail(c.email)) {
        rowErrors.push({ row: row.rowNumber, column: 'Email', message: `"${c.email}" isn't a valid email address.` });
      }

      let isAccurate: boolean | null | undefined; // undefined = not provided (insert: omit; update: n/a below)
      if (c.isAccurate) {
        isAccurate = parseYesNo(c.isAccurate);
        if (isAccurate === undefined) {
          rowErrors.push({ row: row.rowNumber, column: 'Details Accurate', message: `"${c.isAccurate}" must be Yes, No, or blank.` });
        }
      } else if (isUpdate) {
        isAccurate = null; // blank on update clears to "not yet checked" — genuinely this field's own empty state
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      const jobTitle = c.jobTitle || null;
      const roleType = c.roleType || null;

      if (isUpdate) {
        const data: Prisma.StakeholderUncheckedUpdateInput = {
          clientId: clientId!,
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          linkedinUrl: c.linkedinUrl || null,
          email: c.email || null,
          mobile: c.mobile || null,
          isAccurate,
          inaccurateReason: c.inaccurateReason || null,
        };
        plans.push({ kind: 'update', existingId: existingId!, data, coverageLocationIds, jobTitle, roleType });
      } else {
        const data: Prisma.StakeholderUncheckedCreateInput = {
          clientId: clientId!,
          ...(c.firstName ? { firstName: c.firstName } : {}),
          ...(c.lastName ? { lastName: c.lastName } : {}),
          ...(c.linkedinUrl ? { linkedinUrl: c.linkedinUrl } : {}),
          ...(c.email ? { email: c.email } : {}),
          ...(c.mobile ? { mobile: c.mobile } : {}),
          ...(isAccurate !== undefined ? { isAccurate } : {}),
          ...(c.inaccurateReason ? { inaccurateReason: c.inaccurateReason } : {}),
        };
        plans.push({ kind: 'insert', data, coverageLocationIds, jobTitle, roleType });
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
          const roleTypeUpsert = plan.roleType
            ? (await tx.stakeholderRoleType.upsert({ where: { name: plan.roleType }, create: { name: plan.roleType }, update: {} })).id
            : await classifyRoleTypeId(tx, plan.jobTitle);

          if (plan.kind === 'insert') {
            const created = await tx.stakeholder.create({
              data: {
                ...plan.data,
                ...(jobTitleId ? { jobTitleId } : {}),
                stakeholderRoleTypeId: roleTypeUpsert,
                ...(plan.coverageLocationIds.length > 0
                  ? { coverage: { create: plan.coverageLocationIds.map((locationId) => ({ locationId })) } }
                  : {}),
              },
            });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'CREATE',
                entityType: 'Stakeholder',
                entityId: created.id,
                changes: toJson(created) as Prisma.InputJsonValue,
                metadata,
              },
            });
          } else {
            const before = await tx.stakeholder.findUnique({ where: { id: plan.existingId } });
            const data = {
              ...plan.data,
              jobTitleId,
              stakeholderRoleTypeId: roleTypeUpsert,
              coverage: { deleteMany: {}, create: plan.coverageLocationIds.map((locationId) => ({ locationId })) },
            };
            const updated = await tx.stakeholder.update({ where: { id: plan.existingId }, data });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'UPDATE',
                entityType: 'Stakeholder',
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
