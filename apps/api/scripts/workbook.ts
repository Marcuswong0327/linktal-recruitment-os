/**
 * Shared plumbing for every workbook importer: fetching the source sheet,
 * reading tabs, normalising the values, and collecting rejects.
 *
 * The source is the live Google Sheet. It's cached to `data/` on first fetch;
 * pass `--refresh` (or set WORKBOOK_REFRESH=1) to re-download.
 *
 * Two facts about this workbook shape everything here:
 *
 *  1. **Every ID column is empty.** Cross-sheet links are written as name +
 *     spreadsheet row number — "Hakka Pty Ltd - Row 439", "Amandeep Singh -
 *     row 2027", "Chen Yu (User Row 2 )". `parseRowLink` reads those. Row
 *     numbers are 1-based *spreadsheet* rows, so the header is row 1 and the
 *     first data row is row 2.
 *
 *  2. **Values are inconsistently spelled and spaced.** Cities appear as both
 *     "Sydney NSW" and "Sydney (NSW)", with typos ("Melboune VIC") and stray
 *     punctuation ("Sydney NSW,"). Nothing is matched raw; it all goes through
 *     `norm` and, for locations, the alias map.
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { DATA_DIR } from './data-dir';

/** The Linktal source workbook, exported as xlsx. */
const SHEET_ID = '1CSyiKJCPXnEuRGGysDf7pX71WomJDCZf';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const CACHE_PATH = path.join(DATA_DIR, 'linktal-workbook.xlsx');

export const SHEETS = {
  users: 'User List ',
  clients: 'Client(Company)',
  stakeholders: 'Client (stakeholders)',
  clientContacts: 'Client&Linkta (Contact History)',
  jobResearch: 'Clients(Marketplc Job Research)',
  tobs: 'Client (TOB Details)',
  candidates: 'Candidate (Info)',
  candidateContacts: 'Candidate (Contact History)',
  jobOrders: 'Linktal JobOrder',
  interactions: 'Cdd Clt Linktal Interact His',
} as const;

export type SheetKey = keyof typeof SHEETS;

let cached: XLSX.WorkBook | null = null;

export async function loadWorkbook(): Promise<XLSX.WorkBook> {
  if (cached) return cached;
  const refresh = process.argv.includes('--refresh') || process.env.WORKBOOK_REFRESH === '1';
  if (refresh || !fs.existsSync(CACHE_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`↓ Fetching workbook from Google Sheets...`);
    const res = await fetch(SHEET_URL);
    if (!res.ok) {
      throw new Error(`Workbook fetch failed: ${res.status} ${res.statusText}`);
    }
    fs.writeFileSync(CACHE_PATH, Buffer.from(await res.arrayBuffer()));
    console.log(`  cached to ${CACHE_PATH}`);
  }
  cached = XLSX.readFile(CACHE_PATH);
  return cached;
}

export type Row = {
  /** 1-based spreadsheet row number — what the cross-sheet links refer to. */
  rowNumber: number;
  cells: (string | number | null)[];
};

/**
 * Reads a tab as rows, skipping the header. `rowNumber` is preserved as the
 * real spreadsheet row so links resolve against it — never the array index.
 */
export async function readSheet(key: SheetKey): Promise<{ header: string[]; rows: Row[] }> {
  const wb = await loadWorkbook();
  const ws = wb.Sheets[SHEETS[key]];
  if (!ws) throw new Error(`Sheet not found: ${SHEETS[key]}`);
  const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  const header = (raw[0] ?? []).map((h, i) => (h === null ? `col${i}` : String(h).trim()));
  const rows = raw.slice(1).map((cells, i) => ({ rowNumber: i + 2, cells }));
  return { header, rows };
}

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

/** Trim, collapse internal whitespace, and treat blank/"nullable" as absent. */
export function norm(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/\s+/g, ' ');
  if (s === '' || s.toLowerCase() === 'nullable' || s.toLowerCase() === 'na') return null;
  return s;
}

/** Splits a multi-value cell ("Sydney NSW; Melbourne VIC, Brisbane GC QLD"). */
export function splitList(value: unknown): string[] {
  const s = norm(value);
  if (!s) return [];
  return s
    .split(/[;,]/)
    .map((part) => norm(part))
    .filter((part): part is string => part !== null);
}

/** True when a cell means "everything" — the sheet's wildcard. */
export function isWildcard(value: unknown): boolean {
  return norm(value)?.toLowerCase() === 'all';
}

/**
 * Pulls the row number out of a cross-sheet link: "Hakka Pty Ltd - Row 439",
 * "Amandeep Singh - row 2027", "Chen Yu (User Row 2 )", "Sale - Row 13".
 * Returns null when the cell carries no row reference at all — the caller
 * decides whether to fall back to name matching or reject the row.
 */
export function parseRowLink(value: unknown): { name: string | null; rowNumber: number | null } {
  const s = norm(value);
  if (!s) return { name: null, rowNumber: null };
  const match = s.match(/\(?\s*(?:user\s+)?rows?\s+(\d+)\s*\)?/i);
  if (!match) return { name: s, rowNumber: null };
  const name = norm(s.slice(0, match.index).replace(/[-–(]\s*$/, ''));
  return { name, rowNumber: Number(match[1]) };
}

/**
 * Dates arrive in two shapes: Excel serials (46227, from the Job Research tab)
 * and hand-typed strings ("1st Jan 2026", and the source's own typo "7st Jan
 * 2026"). Returns null rather than an Invalid Date so callers can reject.
 */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Excel serial: days since 1899-12-30 (accounting for the 1900 leap-year bug).
    const parsed = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const s = String(value).trim();
  // Strip the ordinal suffix, including the sheet's malformed ones ("7st", "23th").
  const cleaned = s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Splits a person's name. The candidate sheet has First/Last on some rows and
 * only a combined Full Name on others; treat the last whitespace-separated
 * token as the surname, which is right for the overwhelming majority here and
 * wrong in a way that's visible and fixable rather than silent.
 */
export function splitName(
  first: unknown,
  last: unknown,
  full: unknown,
): { firstName: string | null; lastName: string | null } {
  const f = norm(first);
  const l = norm(last);
  if (f || l) return { firstName: f, lastName: l };
  const fullName = norm(full);
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

// ---------------------------------------------------------------------------
// Reject reporting
// ---------------------------------------------------------------------------

/**
 * Anything the importer can't resolve is collected here rather than guessed at
 * or silently dropped — an unknown city must never quietly mint a junk Location
 * node, and a dangling row link must never quietly orphan a record.
 */
export class RejectReport {
  private readonly entries: { sheet: string; row: number; field: string; value: string; reason: string }[] = [];

  add(sheet: string, row: number, field: string, value: unknown, reason: string): void {
    this.entries.push({ sheet, row, field, value: String(value ?? ''), reason });
  }

  get count(): number {
    return this.entries.length;
  }

  /** Groups by reason so 3,000 rejects read as a handful of fixable causes. */
  print(): void {
    if (this.entries.length === 0) {
      console.log('\n✅ No rejects.');
      return;
    }
    console.log(`\n⚠️  ${this.entries.length} reject(s):`);
    const byReason = new Map<string, typeof this.entries>();
    for (const entry of this.entries) {
      const key = `${entry.sheet} · ${entry.field} · ${entry.reason}`;
      const list = byReason.get(key) ?? [];
      list.push(entry);
      byReason.set(key, list);
    }
    for (const [key, list] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const samples = [...new Set(list.map((e) => e.value))].slice(0, 5);
      console.log(`  ${list.length.toString().padStart(5)}  ${key}`);
      console.log(`         e.g. ${samples.map((s) => JSON.stringify(s)).join(', ')}`);
      console.log(`         rows: ${list.slice(0, 10).map((e) => e.row).join(', ')}${list.length > 10 ? ' …' : ''}`);
    }
  }

  writeTo(fileName: string): void {
    const out = path.join(DATA_DIR, fileName);
    fs.writeFileSync(
      out,
      ['sheet,row,field,value,reason']
        .concat(
          this.entries.map((e) =>
            [e.sheet, e.row, e.field, e.value, e.reason]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(','),
          ),
        )
        .join('\n'),
    );
    console.log(`\n📄 Reject report written to ${out}`);
  }
}
