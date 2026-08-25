import ExcelJS from 'exceljs';
import { REQUIRED_HEADER_SUFFIX } from './xlsx-import';

const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 60;

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** `<entityNamePlural>-<today>.xlsx` — shared filename convention across every export controller. */
export function exportFilename(entityNamePlural: string): string {
  return `${entityNamePlural}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export interface ExportColumn {
  header: string;
  key: string;
  /** Enables wrap-text alignment — for long free-text fields (notes, descriptions) that would otherwise overflow visually. */
  wrap?: boolean;
  /**
   * Marks this column required for import, the same way the corresponding
   * *_IMPORT_COLUMNS entry does — an exported sheet is also what "Export to
   * Excel → edit → re-upload to update" re-imports, so someone editing it
   * needs the same "don't blank this out" warning the blank template shows,
   * or they'll only discover it's required from a rejected re-upload.
   */
  required?: boolean;
}

/** Builds a single-sheet, human-readable .xlsx buffer — frozen + bold header, autofilter, content-sized columns, wrapped long text, truly blank cells for "no value". Shared by every entity's export endpoint. */
export async function buildWorkbook(
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Blank/null cells stay genuinely empty — NOT '—'. This sheet is also
  // what "Export to Excel → edit → re-upload" re-imports (see
  // ImportDialog's own instructions), and every importer's own blank/clear
  // rule (docs: an optional column blank on an update row clears it) only
  // recognizes an actually-empty cell — a literal '—' character fails a
  // URL/email column's validation, or on a plain text column, would get
  // written back as the field's new value instead of clearing it. On-screen
  // tables render their own '—' for a missing value independently of this;
  // that's a display concern for that component, not the export file.
  const displayRows = rows.map((row) =>
    Object.fromEntries(columns.map(({ key }) => [key, row[key] === '' || row[key] == null ? null : row[key]])),
  );

  sheet.columns = columns.map(({ header, key, wrap, required }) => {
    const displayHeader = required ? `${header}${REQUIRED_HEADER_SUFFIX}` : header;
    const longest = displayRows.reduce((max, row) => Math.max(max, String(row[key] ?? '').length), displayHeader.length);
    return {
      header: displayHeader,
      key,
      width: Math.min(Math.max(longest + 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH),
      style: wrap ? { alignment: { wrapText: true, vertical: 'top' } } : undefined,
    };
  });

  sheet.addRows(displayRows);
  sheet.getRow(1).font = { bold: true };
  // Same red-on-bold treatment as buildTemplateWorkbook's required columns —
  // one visual language across both file types.
  columns.forEach((col, i) => {
    if (col.required) sheet.getRow(1).getCell(i + 1).font = { bold: true, color: { argb: 'FFB91C1C' } };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * The server has no ambient "browser timezone" — the client reads its own
 * via `Intl.DateTimeFormat().resolvedOptions().timeZone` and sends it along
 * with the export request. Falls back to UTC for a missing/malformed value
 * (a bad IANA string throws inside `Intl.DateTimeFormat`, not something to
 * ever 400 the whole export over).
 */
export function resolveTimeZone(timeZone?: string): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Splits an ISO contact timestamp into separate Date/Time export columns —
 * '' for each when null (never contacted). Ported from the frontend's
 * splitContactDateTime (apps/web/src/lib/excel-export.ts), now running
 * server-side against the caller's own timezone (see `resolveTimeZone`)
 * rather than reading it directly off `Date`.
 */
export function splitContactDateTime(iso: string | Date | null, timeZone: string) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

/** Matches the frontend's `dateFormatter` (en-GB, e.g. "15 Aug 2026") in the caller's own timezone. */
export function formatExportDate(iso: string | Date | null, timeZone: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );
}
