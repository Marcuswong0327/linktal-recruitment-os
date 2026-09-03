import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CandidateStatus, Prisma } from '@prisma/client';
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
  buildNameIndex,
  buildNameReferenceSheet,
  buildSpecializationReferenceSheet,
  buildTemplateWorkbook,
  chunk,
  findInFileDuplicates,
  parseWorkbook,
} from '../common/xlsx-import';

export const CANDIDATE_IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'Display ID', key: 'displayId' },
  { header: 'First Name', key: 'firstName' },
  { header: 'Last Name', key: 'lastName' },
  { header: 'Email', key: 'email' },
  { header: 'Mobile', key: 'mobile' },
  {
    header: 'Location',
    key: 'location',
    required: true,
    dropdown: { kind: 'reference', sheetTitle: 'Locations', columnKey: 'name' },
  },
  {
    header: 'Industry',
    key: 'industry',
    required: true,
    dropdown: { kind: 'reference', sheetTitle: 'Industries', columnKey: 'name' },
  },
  {
    header: 'Job Role Type',
    key: 'jobRoleType',
    dropdown: { kind: 'reference', sheetTitle: 'Job Role Types', columnKey: 'name' },
  },
  { header: 'Current Role', key: 'currentRole' },
  { header: 'Current Company', key: 'currentCompany' },
  { header: 'LinkedIn URL', key: 'linkedinUrl' },
  { header: 'Seek Talent URL', key: 'seekTalentUrl' },
  { header: 'Raw Resume URL', key: 'rawResumeUrl' },
  { header: 'Edited Resume URL', key: 'editedResumeUrl' },
  // Multi-value (semicolon-separated) — deliberately no dropdown, same
  // reasoning as Client's Locations.
  { header: 'Specializations', key: 'specializations' },
  { header: 'Status', key: 'status', required: true, dropdown: { kind: 'inline', values: ['COLD', 'WARM', 'PLACED', 'UNS'] } },
];

const CANDIDATE_IMPORT_INSTRUCTIONS = [
  'Location and Industry must exactly match an existing name in this system (case-insensitive) — an unmatched value is rejected, never guessed or auto-created.',
  'Location: a single Country or City Coverage value from the Locations sheet, e.g. "Sydney NSW" or "Malaysia".',
  'Specializations: semicolon-separated, must exist under the row\'s own Industry — an unmatched value is rejected.',
  'Job Role Type is grown freely (same as typing a new one into the combobox in the app) — an unmatched value creates it rather than being rejected.',
  'Status: COLD, WARM, PLACED, or UNS.',
  'Not included in this template — edit these from the Candidate page instead: Work History, Notes.',
];

const URL_COLUMNS = [
  ['linkedinUrl', 'LinkedIn URL'],
  ['seekTalentUrl', 'Seek Talent URL'],
  ['rawResumeUrl', 'Raw Resume URL'],
  ['editedResumeUrl', 'Edited Resume URL'],
] as const;

function matchEnum<T extends string>(values: readonly T[], input: string): T | undefined {
  return values.find((v) => v.toLowerCase() === input.toLowerCase());
}

type CandidateRowPlan =
  | {
      kind: 'insert';
      data: Prisma.CandidateUncheckedCreateInput;
      specializationIds: string[];
      jobRoleType: string | null;
    }
  | {
      kind: 'update';
      existingId: string;
      data: Prisma.CandidateUncheckedUpdateInput;
      specializationIds: string[];
      jobRoleType: string | null;
    };

/**
 * Backs `GET /candidates/import/template` and `POST /candidates/import`.
 * Same read/write split, all-or-nothing commit shape, and restricted-vs-
 * growable-catalog distinction as ClientsImportService/StakeholdersImportService
 * — see their docs. Job Role Type is the growable one here (same treatment
 * as Stakeholder's Job Title): an unmatched name is never a validation
 * error, just auto-created at commit time via upsert, never during a
 * commit=false preview.
 */
@Injectable()
export class CandidatesImportService {
  constructor(
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    private readonly base: PrismaService,
  ) {}

  async buildTemplate(): Promise<Buffer> {
    const [locations, industries, specializations, jobRoleTypes] = await Promise.all([
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true, level: true, parentId: true } }),
      this.base.industry.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.specialization.findMany({
        where: { isActive: true },
        select: { name: true, industry: { select: { name: true } } },
      }),
      this.base.jobRoleType.findMany({ where: { isActive: true }, select: { name: true } }),
    ]);
    return buildTemplateWorkbook('Candidates', CANDIDATE_IMPORT_COLUMNS, CANDIDATE_IMPORT_INSTRUCTIONS, [
      buildLocationReferenceSheet(locations),
      buildNameReferenceSheet('Industries', industries),
      buildSpecializationReferenceSheet(specializations),
      buildNameReferenceSheet('Job Role Types', jobRoleTypes),
    ]);
  }

  async validate(buffer: Buffer): Promise<{ errors: ImportRowError[]; plans: CandidateRowPlan[]; totalRows: number }> {
    if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB limit.`,
      });
    }

    const { rows, headerErrors } = await parseWorkbook(buffer, CANDIDATE_IMPORT_COLUMNS);
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

    const [industries, locations, specializations, existingCandidates] = await Promise.all([
      this.base.industry.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true } }),
      this.base.specialization.findMany({
        where: { isActive: true },
        select: { id: true, name: true, industryId: true },
      }),
      this.prisma.candidate.findMany({ select: { id: true, displayId: true } }),
    ]);

    const industryIndex = buildNameIndex(industries);
    const locationIndex = buildLocationPathIndex(locations);
    const candidateIdByDisplayId = new Map(existingCandidates.map((c) => [c.displayId, c.id]));
    // Specialization.name is unique per-industry, not globally — same as
    // ClientsImportService's index.
    const specializationsByIndustry = new Map<string, Map<string, string>>();
    for (const s of specializations) {
      if (!specializationsByIndustry.has(s.industryId)) specializationsByIndustry.set(s.industryId, new Map());
      specializationsByIndustry.get(s.industryId)!.set(s.name.toLowerCase(), s.id);
    }

    const duplicateRowNumbers = new Set(errors.map((e) => e.row));
    const plans: CandidateRowPlan[] = [];

    for (const row of rows) {
      if (duplicateRowNumbers.has(row.rowNumber)) continue;
      const rowErrors: ImportRowError[] = [];
      const c = row.cells;

      let existingId: string | undefined;
      if (c.displayId) {
        existingId = candidateIdByDisplayId.get(c.displayId);
        if (!existingId) {
          rowErrors.push({
            row: row.rowNumber,
            column: 'Display ID',
            message: `No existing candidate with Display ID "${c.displayId}" — leave it blank to create a new one.`,
          });
        }
      }
      const isUpdate = existingId != null;

      for (const col of CANDIDATE_IMPORT_COLUMNS) {
        if (col.required && !c[col.key]) {
          rowErrors.push({ row: row.rowNumber, column: col.header, message: `${col.header} is required.` });
        }
      }

      let locationId: string | undefined;
      if (c.location) {
        locationId = locationIndex.get(c.location.toLowerCase());
        if (!locationId) rowErrors.push({ row: row.rowNumber, column: 'Location', message: `Unknown location "${c.location}".` });
      }

      let industryId: string | undefined;
      if (c.industry) {
        industryId = industryIndex.get(c.industry.toLowerCase());
        if (!industryId) rowErrors.push({ row: row.rowNumber, column: 'Industry', message: `Unknown industry "${c.industry}".` });
      }

      const specializationIds: string[] = [];
      if (c.specializations) {
        for (const name of c.specializations.split(';').map((s) => s.trim()).filter(Boolean)) {
          if (!industryId) break; // Industry itself already failed above — skip a redundant cascade error
          const id = specializationsByIndustry.get(industryId)?.get(name.toLowerCase());
          if (id) specializationIds.push(id);
          else rowErrors.push({ row: row.rowNumber, column: 'Specializations', message: `Unknown specialization "${name}" under industry "${c.industry}".` });
        }
      }

      if (c.email && !isEmail(c.email)) {
        rowErrors.push({ row: row.rowNumber, column: 'Email', message: `"${c.email}" isn't a valid email address.` });
      }
      for (const [key, header] of URL_COLUMNS) {
        const value = c[key];
        if (value && !isURL(value)) {
          rowErrors.push({ row: row.rowNumber, column: header, message: `"${value}" isn't a valid URL.` });
        }
      }

      const status = c.status ? matchEnum(Object.values(CandidateStatus), c.status) : undefined;
      if (c.status && !status) {
        rowErrors.push({ row: row.rowNumber, column: 'Status', message: `"${c.status}" isn't a valid status (COLD, WARM, PLACED, UNS).` });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      const jobRoleType = c.jobRoleType || null;

      if (isUpdate) {
        const data: Prisma.CandidateUncheckedUpdateInput = {
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          email: c.email || null,
          mobile: c.mobile || null,
          locationId: locationId!,
          industryId: industryId!,
          currentRole: c.currentRole || null,
          currentCompany: c.currentCompany || null,
          linkedinUrl: c.linkedinUrl || null,
          seekTalentUrl: c.seekTalentUrl || null,
          rawResumeUrl: c.rawResumeUrl || null,
          editedResumeUrl: c.editedResumeUrl || null,
          status: status!,
        };
        plans.push({ kind: 'update', existingId: existingId!, data, specializationIds, jobRoleType });
      } else {
        const data: Prisma.CandidateUncheckedCreateInput = {
          locationId: locationId!,
          industryId: industryId!,
          status: status!,
          ...(c.firstName ? { firstName: c.firstName } : {}),
          ...(c.lastName ? { lastName: c.lastName } : {}),
          ...(c.email ? { email: c.email } : {}),
          ...(c.mobile ? { mobile: c.mobile } : {}),
          ...(c.currentRole ? { currentRole: c.currentRole } : {}),
          ...(c.currentCompany ? { currentCompany: c.currentCompany } : {}),
          ...(c.linkedinUrl ? { linkedinUrl: c.linkedinUrl } : {}),
          ...(c.seekTalentUrl ? { seekTalentUrl: c.seekTalentUrl } : {}),
          ...(c.rawResumeUrl ? { rawResumeUrl: c.rawResumeUrl } : {}),
          ...(c.editedResumeUrl ? { editedResumeUrl: c.editedResumeUrl } : {}),
        };
        plans.push({ kind: 'insert', data, specializationIds, jobRoleType });
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
          const jobRoleTypeId = plan.jobRoleType
            ? (await tx.jobRoleType.upsert({ where: { name: plan.jobRoleType }, create: { name: plan.jobRoleType }, update: {} })).id
            : plan.kind === 'update'
              ? null
              : undefined;

          if (plan.kind === 'insert') {
            const created = await tx.candidate.create({
              data: {
                ...plan.data,
                ...(jobRoleTypeId ? { jobRoleTypeId } : {}),
                ...(plan.specializationIds.length > 0
                  ? { specializations: { create: plan.specializationIds.map((specializationId) => ({ specializationId })) } }
                  : {}),
              },
            });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'CREATE',
                entityType: 'Candidate',
                entityId: created.id,
                changes: toJson(created) as Prisma.InputJsonValue,
                metadata,
              },
            });
          } else {
            const before = await tx.candidate.findUnique({ where: { id: plan.existingId } });
            const data = {
              ...plan.data,
              jobRoleTypeId,
              specializations: { deleteMany: {}, create: plan.specializationIds.map((specializationId) => ({ specializationId })) },
            };
            const updated = await tx.candidate.update({ where: { id: plan.existingId }, data });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'UPDATE',
                entityType: 'Candidate',
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
