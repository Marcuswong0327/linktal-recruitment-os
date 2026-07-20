import * as XLSX from 'xlsx';

const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 60;

/** Turns flat row objects into a downloaded .xlsx — shared by every table's "Export to Excel" action. */
export function downloadAsExcel(rows: Record<string, unknown>[], filenamePrefix: string, sheetName: string) {
  // '—' reads clearer than a blank cell for "no value" — matches how every
  // on-screen table in this app already renders missing fields.
  const displayRows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === '' ? '—' : value])),
  );

  const sheet = XLSX.utils.json_to_sheet(displayRows);

  // json_to_sheet leaves every column at Excel's narrow default width, which
  // visually clips longer values even though the underlying cell data is
  // complete — size each column to its content instead. Capped, not
  // uncapped: one long note shouldn't blow a whole column out to 300+ chars
  // wide; it just overflows visually into empty cells to the right instead
  // (this package's free tier doesn't support cell-level text wrapping).
  const keys = displayRows.length > 0 ? Object.keys(displayRows[0]) : [];
  sheet['!cols'] = keys.map((key) => {
    const longest = displayRows.reduce((max, row) => Math.max(max, String(row[key] ?? '').length), key.length);
    return { wch: Math.min(Math.max(longest + 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}-${stamp}.xlsx`);
}

/**
 * Splits an ISO contact timestamp into separate Date/Time export columns —
 * '' for each when null (never contacted). Both are browser-local (plain
 * `Date` accessors without a `UTC` prefix already read in the viewer's own
 * timezone). The date is built manually as ISO (YYYY-MM-DD) rather than via
 * `toLocaleDateString()`, whose M/D/YYYY-style output is ambiguous across
 * locales; the time keeps the locale format since hour order isn't ambiguous
 * the same way.
 */
export function splitContactDateTime(iso: string | null) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { date, time: d.toLocaleTimeString() };
}
