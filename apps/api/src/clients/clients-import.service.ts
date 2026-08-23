import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ClientQuality, ClientStatus, Prisma } from '@prisma/client';
import { isURL } from 'class-validator';
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

export const CLIENT_IMPORT_COLUMNS: ImportColumn[] = [
  { header: 'Display ID', key: 'displayId' },
  { header: 'Company Name', key: 'companyName', required: true },
  {
    header: 'Industry',
    key: 'industry',
    required: true,
    dropdown: { kind: 'reference', sheetTitle: 'Industries', columnKey: 'name' },
  },
  {
    header: 'Specialization',
    key: 'specialization',
    dropdown: { kind: 'reference', sheetTitle: 'Specializations', columnKey: 'name' },
  },
  // Multi-value (semicolon-separated) — deliberately no dropdown: Excel's
  // list validation can only replace a cell's whole value, never append to
  // it, so a dropdown here would actively break entering more than one.
  { header: 'Locations', key: 'locations', required: true },
  { header: 'Website', key: 'website' },
  { header: 'Seek Job Market URL', key: 'seekJobMarketUrl' },
  { header: 'LinkedIn Job Market URL', key: 'linkedinJobMarketUrl' },
  { header: 'General Description', key: 'generalDescription' },
  { header: 'Status', key: 'status', required: true, dropdown: { kind: 'inline', values: ['COLD', 'WARM', 'TRADED'] } },
  { header: 'Quality', key: 'quality', required: true, dropdown: { kind: 'inline', values: ['LOW', 'MEDIUM', 'HIGH'] } },
];

const CLIENT_IMPORT_INSTRUCTIONS = [
  'Industry and Specialization must exactly match an existing name in this system (case-insensitive). An unmatched value is rejected, never guessed or auto-created.',
  'Locations: semicolon-separated breadcrumb paths, e.g. "Australia > New South Wales > Sydney; Australia > Victoria > Melbourne". At least one is required.',
  'Status: COLD, WARM, or TRADED. Quality: LOW, MEDIUM, or HIGH.',
  'Not included in this template — edit these from the Company page instead: Addresses, Suburbs & Postcodes.',
];

type ClientRowPlan =
  | { kind: 'insert'; data: Prisma.ClientUncheckedCreateInput; locationIds: string[] }
  | { kind: 'update'; existingId: string; data: Prisma.ClientUncheckedUpdateInput; locationIds: string[] };

const URL_COLUMNS = [
  ['website', 'Website'],
  ['seekJobMarketUrl', 'Seek Job Market URL'],
  ['linkedinJobMarketUrl', 'LinkedIn Job Market URL'],
] as const;

function matchEnum<T extends string>(values: readonly T[], input: string): T | undefined {
  return values.find((v) => v.toLowerCase() === input.toLowerCase());
}

/**
 * Backs `GET /clients/import/template` and `POST /clients/import`. Reads
 * always go through `base` (catalogs) or the extended client (existing
 * Client rows, so soft-deleted ones are correctly invisible to the
 * displayId match). Writes deliberately run on `base` inside
 * `$transaction` — the audited/extended client's audit hook can't safely
 * wrap a multi-row transaction (see RolesService's identical precedent,
 * `roles.service.ts:93-95`), so this writes its own AuditLog row by hand,
 * inside the same transaction as the write it describes, reusing
 * `toJson`/`computeChanges` from the Prisma extension.
 */
@Injectable()
export class ClientsImportService {
  constructor(
    @Inject(EXTENDED_PRISMA) private readonly prisma: ExtendedPrismaClient,
    private readonly base: PrismaService,
  ) {}

  /**
   * Industry and Specialization are restricted catalogs (admin/manager-only
   * creation) — an unmatched name is always rejected, never auto-created, so
   * their reference sheets double as dropdowns: pick from the list instead
   * of typing a value that might not exist. Locations stays free text (no
   * dropdown) since the Data column is multi-value.
   */
  async buildTemplate(): Promise<Buffer> {
    const [industries, specializations, locations] = await Promise.all([
      this.base.industry.findMany({ where: { isActive: true }, select: { name: true } }),
      this.base.specialization.findMany({
        where: { isActive: true },
        select: { name: true, industry: { select: { name: true } } },
      }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true, level: true } }),
    ]);
    return buildTemplateWorkbook('Companies', CLIENT_IMPORT_COLUMNS, CLIENT_IMPORT_INSTRUCTIONS, [
      buildNameReferenceSheet('Industries', industries),
      buildSpecializationReferenceSheet(specializations),
      buildLocationReferenceSheet(locations),
    ]);
  }

  /** Always re-runs from scratch — a commit never trusts a prior "it validated a moment ago". */
  async validate(buffer: Buffer): Promise<{ errors: ImportRowError[]; plans: ClientRowPlan[]; totalRows: number }> {
    if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB limit.`,
      });
    }

    const { rows, headerErrors } = await parseWorkbook(buffer, CLIENT_IMPORT_COLUMNS);
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

    // Every catalog lookup a row could need, loaded once — never per-row.
    const [industries, locations, specializations, existingClients] = await Promise.all([
      this.base.industry.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.base.location.findMany({ select: { id: true, name: true, ancestorIds: true } }),
      this.base.specialization.findMany({
        where: { isActive: true },
        select: { id: true, name: true, industryId: true },
      }),
      // Extended client: soft-deleted clients are invisible to the displayId
      // match, same as they'd be to any other lookup in this app.
      this.prisma.client.findMany({ select: { id: true, displayId: true } }),
    ]);

    const industryIndex = buildNameIndex(industries);
    const locationIndex = buildLocationPathIndex(locations);
    const clientIdByDisplayId = new Map(existingClients.map((c) => [c.displayId, c.id]));
    // Specialization.name is unique per-industry, not globally (see
    // schema.prisma) — the index has to be scoped the same way.
    const specializationsByIndustry = new Map<string, Map<string, string>>();
    for (const s of specializations) {
      if (!specializationsByIndustry.has(s.industryId)) specializationsByIndustry.set(s.industryId, new Map());
      specializationsByIndustry.get(s.industryId)!.set(s.name.toLowerCase(), s.id);
    }

    // Rows already flagged as an in-file duplicate never get a plan built for
    // them — which one "wins" would be a guess, and this function's `plans`
    // contract is "rows that would actually be written," not "rows with no
    // OTHER problems besides being a duplicate."
    const duplicateRowNumbers = new Set(errors.map((e) => e.row));

    const plans: ClientRowPlan[] = [];

    for (const row of rows) {
      if (duplicateRowNumbers.has(row.rowNumber)) continue;
      const rowErrors: ImportRowError[] = [];
      const c = row.cells;

      let existingId: string | undefined;
      if (c.displayId) {
        existingId = clientIdByDisplayId.get(c.displayId);
        if (!existingId) {
          rowErrors.push({
            row: row.rowNumber,
            column: 'Display ID',
            message: `No existing company with Display ID "${c.displayId}" — a Display ID must already exist to update; leave it blank to create a new company.`,
          });
        }
      }
      const isUpdate = existingId != null;

      for (const col of CLIENT_IMPORT_COLUMNS) {
        if (col.required && !c[col.key]) {
          rowErrors.push({ row: row.rowNumber, column: col.header, message: `${col.header} is required.` });
        }
      }

      let industryId: string | undefined;
      if (c.industry) {
        industryId = industryIndex.get(c.industry.toLowerCase());
        if (!industryId) {
          rowErrors.push({ row: row.rowNumber, column: 'Industry', message: `Unknown industry "${c.industry}".` });
        }
      }

      // null = explicit clear (decision: optional column blank on update
      // wipes it); undefined = not provided at all (insert: simply omitted).
      let specializationId: string | null | undefined;
      if (c.specialization) {
        if (industryId) {
          specializationId = specializationsByIndustry.get(industryId)?.get(c.specialization.toLowerCase());
          if (!specializationId) {
            rowErrors.push({
              row: row.rowNumber,
              column: 'Specialization',
              message: `Unknown specialization "${c.specialization}" under industry "${c.industry}".`,
            });
          }
        }
        // else: Industry itself already failed above — skip a redundant cascade error here.
      } else if (isUpdate) {
        specializationId = null;
      }

      const locationIds: string[] = [];
      if (c.locations) {
        for (const path of c.locations.split(';').map((p) => p.trim()).filter(Boolean)) {
          const id = locationIndex.get(path.toLowerCase());
          if (id) locationIds.push(id);
          else rowErrors.push({ row: row.rowNumber, column: 'Locations', message: `Unknown location "${path}".` });
        }
      }

      for (const [key, header] of URL_COLUMNS) {
        const value = c[key];
        if (value && !isURL(value)) {
          rowErrors.push({ row: row.rowNumber, column: header, message: `"${value}" isn't a valid URL.` });
        }
      }

      const status = c.status ? matchEnum(Object.values(ClientStatus), c.status) : undefined;
      if (c.status && !status) {
        rowErrors.push({ row: row.rowNumber, column: 'Status', message: `"${c.status}" isn't a valid status (COLD, WARM, TRADED).` });
      }
      const quality = c.quality ? matchEnum(Object.values(ClientQuality), c.quality) : undefined;
      if (c.quality && !quality) {
        rowErrors.push({ row: row.rowNumber, column: 'Quality', message: `"${c.quality}" isn't a valid quality (LOW, MEDIUM, HIGH).` });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      if (isUpdate) {
        const data: Prisma.ClientUncheckedUpdateInput = {
          companyName: c.companyName,
          industryId: industryId!,
          specializationId,
          website: c.website || null,
          seekJobMarketUrl: c.seekJobMarketUrl || null,
          linkedinJobMarketUrl: c.linkedinJobMarketUrl || null,
          generalDescription: c.generalDescription || null,
          status: status!,
          quality: quality!,
        };
        plans.push({ kind: 'update', existingId: existingId!, data, locationIds });
      } else {
        const data: Prisma.ClientUncheckedCreateInput = {
          companyName: c.companyName,
          industryId: industryId!,
          ...(specializationId ? { specializationId } : {}),
          ...(c.website ? { website: c.website } : {}),
          ...(c.seekJobMarketUrl ? { seekJobMarketUrl: c.seekJobMarketUrl } : {}),
          ...(c.linkedinJobMarketUrl ? { linkedinJobMarketUrl: c.linkedinJobMarketUrl } : {}),
          ...(c.generalDescription ? { generalDescription: c.generalDescription } : {}),
          status: status!,
          quality: quality!,
        };
        plans.push({ kind: 'insert', data, locationIds });
      }
    }

    return { errors, plans, totalRows: rows.length };
  }

  async importFromWorkbook(
    buffer: Buffer,
    commit: boolean,
    fileName: string | undefined,
  ): Promise<ImportResultEntity> {
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
          if (plan.kind === 'insert') {
            const created = await tx.client.create({
              data: { ...plan.data, locations: { create: plan.locationIds.map((locationId) => ({ locationId })) } },
            });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'CREATE',
                entityType: 'Client',
                entityId: created.id,
                changes: toJson(created) as Prisma.InputJsonValue,
                metadata,
              },
            });
          } else {
            const before = await tx.client.findUnique({ where: { id: plan.existingId } });
            const data = {
              ...plan.data,
              locations: { deleteMany: {}, create: plan.locationIds.map((locationId) => ({ locationId })) },
            };
            const updated = await tx.client.update({ where: { id: plan.existingId }, data });
            await tx.auditLog.create({
              data: {
                actorId,
                action: 'UPDATE',
                entityType: 'Client',
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
