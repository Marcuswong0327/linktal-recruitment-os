import ExcelJS from 'exceljs';

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
}

/** Builds a single-sheet, human-readable .xlsx buffer — frozen + bold header, autofilter, content-sized columns, wrapped long text, '—' for blanks. Shared by every entity's export endpoint. */
export async function buildWorkbook(
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // '—' reads clearer than a blank cell for "no value" — matches how every
  // on-screen table in this app already renders missing fields.
  const displayRows = rows.map((row) =>
    Object.fromEntries(columns.map(({ key }) => [key, row[key] === '' || row[key] == null ? '—' : row[key]])),
  );

  sheet.columns = columns.map(({ header, key, wrap }) => {
    const longest = displayRows.reduce((max, row) => Math.max(max, String(row[key] ?? '').length), header.length);
    return {
      header,
      key,
      width: Math.min(Math.max(longest + 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH),
      style: wrap ? { alignment: { wrapText: true, vertical: 'top' } } : undefined,
    };
  });

  sheet.addRows(displayRows);
  sheet.getRow(1).font = { bold: true };
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
