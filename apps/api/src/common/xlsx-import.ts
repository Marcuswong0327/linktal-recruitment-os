import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

// Matches the existing SELECT_ALL_CAP precedent in
// apps/web/src/features/candidates/CandidatesTable.tsx — a bulk operation
// this app already treats as needing a sane ceiling.
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

// Appended to a required column's header text — on the downloadable template
// (buildTemplateWorkbook) AND on every entity's "Export to Excel" sheet
// (xlsx-export.ts's buildWorkbook), so it's visually marked in Excel itself,
// not just styled. Exported so xlsx-export.ts can reuse the exact same
// marker rather than a second copy that could drift — an export sheet is
// also what "Export to Excel → edit → re-upload to update" re-imports (see
// ImportDialog's own instructions), and someone editing that file can blank
// out a required column without ever seeing the template's own warning, so
// the export needs the same visual cue. `parseWorkbook` strips it back off
// before matching a re-uploaded file's header row either way, so a template
// OR an export sheet, filled in without anyone touching the header row,
// still matches. Without stripping this, every required column on either
// flow fails the header check outright, every time.
export const REQUIRED_HEADER_SUFFIX = ' *';

/** An in-cell Excel dropdown for a Data-sheet column. Only ever set this on a
 *  single-value column — Excel's list validation can only replace a cell's
 *  whole value, never append to it, so a semicolon-separated multi-value
 *  column (e.g. Client's Locations, Candidate's Specializations) must stay
 *  free text with a reference sheet to copy from instead. */
export type ImportDropdown =
  /** A small fixed list (e.g. an enum) — no reference sheet needed. */
  | { kind: 'inline'; values: string[] }
  /** Pulls from one column of a `TemplateReferenceSheet` already passed to `buildTemplateWorkbook`, matched by sheet title + that sheet's column key. */
  | { kind: 'reference'; sheetTitle: string; columnKey: string };

export interface ImportColumn {
  header: string;
  key: string;
  /** A blank cell on ANY row (insert or update) is always a validation error — see docs/… decision on required columns. */
  required?: boolean;
  dropdown?: ImportDropdown;
}

export interface ImportRowError {
  row: number;
  column: string;
  message: string;
}

export interface ParsedRow {
  /** The literal Excel row number (header is row 1) — an error naming this is directly clickable, no off-by-one translation. */
  rowNumber: number;
  /** Every column's raw cell text, trimmed. '' means blank, never omitted. */
  cells: Record<string, string>;
}

export interface ParsedWorkbook {
  rows: ParsedRow[];
  /** Non-empty only when the header row doesn't match the expected columns — nothing else is checked in that case. */
  headerErrors: string[];
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string') {
      return (value as { text: string }).text.trim();
    }
    if ('result' in value) return cellToString((value as { result: ExcelJS.CellValue }).result);
    if ('richText' in value && Array.isArray((value as { richText?: unknown }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join('').trim();
    }
  }
  return String(value).trim();
}

/**
 * Parses the first worksheet of an uploaded .xlsx against `columns`. Row 1
 * must be the header, matched by header text (case-insensitive, order
 * doesn't matter — a user re-arranging columns shouldn't break the import).
 * Every cell is read as trimmed text regardless of Excel's own cell typing:
 * every import field here is free text, an enum name, or a resolved-by-name
 * reference, never a value where Excel's numeric/date typing should win over
 * what's literally displayed.
 */
export async function parseWorkbook(buffer: Buffer, columns: ImportColumn[]): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's own .d.ts resolves a `Buffer` type incompatible with this
    // project's @types/node (a real duplicate-package version-skew issue, not
    // a mistake in the value itself) — the runtime call is fine either way.
    await workbook.xlsx.load(buffer as any);
  } catch {
    // A real-world upload here is routinely not a real .xlsx at all — a CSV
    // (or anything else) saved/renamed with an .xlsx extension, or a
    // genuinely corrupted file. ExcelJS throws on anything that isn't a
    // valid OOXML zip; without this catch that throw was uncaught, surfacing
    // to the user as a generic 500 instead of a clear, actionable 400.
    throw new BadRequestException({
      code: 'INVALID_WORKBOOK',
      message: "Couldn't read this file as an .xlsx workbook — is it a real Excel file (not a renamed .csv or another format)?",
    });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], headerErrors: ['The uploaded file has no worksheet.'] };
  }

  const headerByColumnIndex = new Map<number, string>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellToString(cell.value);
    // Strip the template's own required-column marker back off before
    // matching — see REQUIRED_HEADER_SUFFIX's doc.
    const text = raw.endsWith(REQUIRED_HEADER_SUFFIX) ? raw.slice(0, -REQUIRED_HEADER_SUFFIX.length) : raw;
    if (text) headerByColumnIndex.set(colNumber, text);
  });

  const columnByHeader = new Map(columns.map((c) => [c.header.toLowerCase(), c]));
  const indexByKey = new Map<string, number>();
  for (const [colNumber, header] of headerByColumnIndex) {
    const col = columnByHeader.get(header.toLowerCase());
    if (col) indexByKey.set(col.key, colNumber);
  }

  const headerErrors = columns
    .filter((c) => !indexByKey.has(c.key))
    .map((c) => `Missing expected column "${c.header}" — did the template's header row get edited?`);
  if (headerErrors.length > 0) {
    return { rows: [], headerErrors };
  }

  const rows: ParsedRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber);
    const cells: Record<string, string> = {};
    let hasAnyValue = false;
    for (const col of columns) {
      const text = cellToString(excelRow.getCell(indexByKey.get(col.key)!).value);
      cells[col.key] = text;
      if (text !== '') hasAnyValue = true;
    }
    // Skips a fully blank row — Excel routinely keeps trailing empty rows
    // after the last real one, and those aren't a row the user meant to submit.
    if (hasAnyValue) rows.push({ rowNumber, cells });
  }

  return { rows, headerErrors: [] };
}

export interface TemplateReferenceSheet {
  /** Sheet tab name, e.g. "Companies". */
  title: string;
  columns: { header: string; key: string }[];
  rows: Record<string, unknown>[];
}

/** Excel defined-name characters are far more restrictive than a sheet/column label — strip everything but letters/digits/underscore, since the name is never shown to the user, only referenced internally by the dropdown formula. */
function namedRangeFor(sheetTitle: string, columnKey: string): string {
  return `List_${sheetTitle}_${columnKey}`.replace(/[^A-Za-z0-9_]/g, '');
}

/**
 * Builds a downloadable template: one "Data" sheet (header only, required
 * columns marked, single-value columns wired to an in-cell dropdown where
 * `dropdown` is set), one "Instructions" sheet (what's required, what's
 * excluded and why), and optionally one read-only reference sheet per
 * `referenceSheets` entry — for a column like Stakeholder/JobOrder's Client
 * Display ID, which is required on every row (including new ones) but isn't
 * something a user filling in a blank template would otherwise know without
 * a separate Export download. Reuses xlsx-export.ts's frozen-header/
 * autofilter treatment so a template looks and behaves like this app's own
 * exports.
 *
 * Dropdowns: a workbook-scoped named range is created for every reference-
 * sheet column (cheap, harmless if unused), sized to that sheet's actual row
 * count — then a Data column with `dropdown: {kind:'reference', ...}` just
 * points its list validation at the matching named range. `kind:'inline'`
 * needs no reference sheet or named range at all — Excel accepts a literal
 * comma-joined value list directly in the validation formula. Validation is
 * applied down to `MAX_IMPORT_ROWS + 1` data rows so it never falls short of
 * what a real import can accept, regardless of how many rows the user pastes
 * into a blank template.
 */
export async function buildTemplateWorkbook(
  sheetName: string,
  columns: ImportColumn[],
  instructions: string[],
  referenceSheets: TemplateReferenceSheet[] = [],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const dataSheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  dataSheet.columns = columns.map(({ header, key, required }) => ({
    header: required ? `${header}${REQUIRED_HEADER_SUFFIX}` : header,
    key,
    width: Math.max(header.length + 4, 14),
  }));
  const headerRow = dataSheet.getRow(1);
  headerRow.font = { bold: true };
  columns.forEach((col, i) => {
    if (col.required) headerRow.getCell(i + 1).font = { bold: true, color: { argb: 'FFB91C1C' } };
  });
  dataSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const infoSheet = workbook.addWorksheet('Instructions');
  infoSheet.columns = [{ width: 100 }];
  const required = columns.filter((c) => c.required).map((c) => c.header);
  const dropdownColumns = columns.filter((c) => c.dropdown).map((c) => c.header);
  const lines = [
    'Columns marked with * on the Data sheet are required and can never be left blank, on any row.',
    required.length > 0 ? `Required columns: ${required.join(', ')}.` : null,
    dropdownColumns.length > 0
      ? `Click a cell in these columns for an in-Excel dropdown of every accepted value: ${dropdownColumns.join(', ')}.`
      : null,
    'This template is blank — leave the Display ID column empty on every row to create new records; that\'s all you need for a bulk add.',
    'To UPDATE existing records instead, don\'t start from this template: use "Export to Excel" to download your current data (it already has each row\'s Display ID filled in), edit values there, then upload that file here. A filled-in Display ID matches that exact existing record, and every other column becomes its complete new state — so an optional column left blank on an update row clears it.',
    ...instructions,
    referenceSheets.length > 0
      ? `See the ${referenceSheets.map((r) => `"${r.title}"`).join(', ')} sheet${referenceSheets.length > 1 ? 's' : ''} in this workbook for the exact values recognized by the columns above.`
      : null,
  ].filter((l): l is string => !!l);
  lines.forEach((line, i) => {
    infoSheet.getCell(i + 1, 1).value = line;
    infoSheet.getCell(i + 1, 1).alignment = { wrapText: true };
  });

  // One named range per reference-sheet column, sized to its actual row
  // count — built before the dropdowns below so every reference exists by
  // the time a Data column looks one up.
  for (const ref of referenceSheets) {
    const sheet = workbook.addWorksheet(ref.title, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = ref.columns.map(({ header, key }) => ({
      header,
      key,
      width: Math.max(header.length + 4, 14),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(ref.rows);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ref.columns.length } };

    if (ref.rows.length > 0) {
      // Sheet name must be single-quoted in the range address whenever it
      // isn't a single bare word (e.g. "Job Role Types") — unquoted, exceljs's
      // address parser silently mis-tokenizes on the spaces instead of erroring
      // cleanly.
      const sheetRef = /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref.title) ? ref.title : `'${ref.title}'`;
      ref.columns.forEach((col, i) => {
        const excelCol = String.fromCharCode('A'.charCodeAt(0) + i); // reference sheets are always narrow (≤2 columns) — no need for multi-letter columns
        const lastRow = ref.rows.length + 1;
        workbook.definedNames.add(
          `${sheetRef}!$${excelCol}$2:$${excelCol}$${lastRow}`,
          namedRangeFor(ref.title, col.key),
        );
      });
    }
  }

  // exceljs's own .d.ts omits `Worksheet.dataValidations` (a real runtime
  // API — verified directly against the written OOXML: one compact
  // `sqref="A2:A5001"`-style range entry per column, not one per cell).
  const dataValidations = (dataSheet as unknown as { dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void } })
    .dataValidations;
  columns.forEach((col, i) => {
    if (!col.dropdown) return;
    const excelCol = dataSheet.getColumn(i + 1).letter;
    const formula =
      col.dropdown.kind === 'inline'
        ? `"${col.dropdown.values.join(',')}"`
        : namedRangeFor(col.dropdown.sheetTitle, col.dropdown.columnKey);
    dataValidations.add(`${excelCol}2:${excelCol}${MAX_IMPORT_ROWS + 1}`, {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** One-time catalog name → id lookup, built once per validate/import call — never issue this per row. Keys are lowercased for case-insensitive, still-exact matching. */
export function buildNameIndex(rows: { id: string; name: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
}

/**
 * A Location's own `name` isn't globally unique (a suburb can repeat under
 * different states), so location-valued columns use a breadcrumb path
 * ("Australia > New South Wales > Sydney") built from each row's own
 * `ancestorIds` (root-last, per schema.prisma) reversed to root-first, joined
 * with the row's own name last. Keys are lowercased for exact-but-case-
 * insensitive matching, same as buildNameIndex.
 */
type LocationRow = { id: string; name: string; ancestorIds: string[] };

/**
 * The breadcrumb path for one location — factored out so
 * buildLocationPathIndex (the matcher), buildLocationReferenceSheet (what a
 * user copies from), and every entity's export sheet (what a re-uploaded
 * file's Location column must already look like, for the round trip to
 * actually resolve) all draw from the exact same logic, so they can never
 * silently drift apart. `loc` only needs `name`/`ancestorIds` — an export
 * row's already-resolved location doesn't carry its own `id`.
 */
export function locationBreadcrumbPath(loc: { name: string; ancestorIds: string[] }, byId: Map<string, LocationRow>): string {
  const ancestorNames = [...loc.ancestorIds].reverse().map((id) => byId.get(id)?.name ?? '?');
  return [...ancestorNames.slice(0, -1), loc.name].join(' > ');
}

/** `id -> full row` lookup for `locationBreadcrumbPath`'s `byId` argument — one place building this map, instead of every export service re-deriving the same one-liner. */
export function buildLocationById(locations: LocationRow[]): Map<string, LocationRow> {
  return new Map(locations.map((l) => [l.id, l]));
}

export function buildLocationPathIndex(locations: LocationRow[]): Map<string, string> {
  const byId = buildLocationById(locations);
  const index = new Map<string, string>();
  for (const loc of locations) {
    index.set(locationBreadcrumbPath(loc, byId).toLowerCase(), loc.id);
  }
  return index;
}

/** Flat single-column "Name" reference sheet — Industry, Job Title, Job Role Type, and Stakeholder Role Type all share this shape (schema.prisma has no other column on any of them worth surfacing). */
export function buildNameReferenceSheet(title: string, rows: { name: string }[]): TemplateReferenceSheet {
  return {
    title,
    columns: [{ header: 'Name', key: 'name' }],
    rows: [...rows].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Industry + Specialization name, since Specialization.name (schema.prisma) is unique only per-industry, not globally — the Specialization column alone wouldn't be enough to know which row a name refers to. */
export function buildSpecializationReferenceSheet(
  specializations: { name: string; industry: { name: string } }[],
): TemplateReferenceSheet {
  const rows = specializations
    .map((s) => ({ industryName: s.industry.name, name: s.name }))
    .sort((a, b) => a.industryName.localeCompare(b.industryName) || a.name.localeCompare(b.name));
  return {
    title: 'Specializations',
    columns: [
      { header: 'Industry', key: 'industryName' },
      { header: 'Specialization', key: 'name' },
    ],
    rows,
  };
}

/**
 * Every location's exact breadcrumb path — the literal string a Location-
 * type Data column expects, so it's directly copy-pasteable — plus its level
 * so the sheet's own autoFilter can narrow a ~2k-row list down. Every level
 * is included (not just leaves): the live in-app Location picker
 * (LocationMultiSelect) lets a user pick a bare country or state just as
 * validly as a suburb, so filtering those out here would hide legitimate
 * values.
 */
export function buildLocationReferenceSheet(locations: (LocationRow & { level: string })[]): TemplateReferenceSheet {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const rows = locations
    .map((l) => ({ path: locationBreadcrumbPath(l, byId), level: l.level }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    title: 'Locations',
    columns: [
      { header: 'Location Path', key: 'path' },
      { header: 'Level', key: 'level' },
    ],
    rows,
  };
}

/**
 * Decision: in-file duplicates reject the whole file, naming every colliding
 * row. The only reliable duplicate key across every entity is a repeated
 * non-blank Display ID within one upload — two rows both claiming to update
 * the same existing record is always ambiguous, regardless of which entity.
 * Blank-Display-ID (new-row) duplicates are deliberately NOT flagged here —
 * natural-key matching (name/email/etc.) is documented elsewhere in this
 * codebase as unreliable (e.g. candidates: many legitimate rows share an
 * email or mobile), so guessing at "these are probably the same person" would
 * violate the same reject-never-guess rule this function exists to enforce.
 */
export function findInFileDuplicates(rows: { rowNumber: number; displayId: string }[]): ImportRowError[] {
  const rowsByDisplayId = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.displayId) continue;
    const list = rowsByDisplayId.get(row.displayId) ?? [];
    list.push(row.rowNumber);
    rowsByDisplayId.set(row.displayId, list);
  }
  const errors: ImportRowError[] = [];
  for (const [displayId, rowNumbers] of rowsByDisplayId) {
    if (rowNumbers.length < 2) continue;
    for (const rowNumber of rowNumbers) {
      errors.push({
        row: rowNumber,
        column: 'Display ID',
        message: `"${displayId}" also appears on row(s) ${rowNumbers.filter((r) => r !== rowNumber).join(', ')} — each row must reference a different record.`,
      });
    }
  }
  return errors;
}

/** Splits `items` into fixed-size groups, preserving order — used to keep each commit transaction Neon-friendly instead of writing an entire (possibly thousands-of-rows) file in one transaction. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
