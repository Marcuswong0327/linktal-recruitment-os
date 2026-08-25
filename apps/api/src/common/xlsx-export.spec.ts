import ExcelJS from 'exceljs';
import { buildWorkbook, ExportColumn } from './xlsx-export';

async function readCell(buffer: Buffer, row: number, col: number) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets[0].getRow(row).getCell(col).value;
}

describe('buildWorkbook', () => {
  const columns: ExportColumn[] = [
    { header: 'Name', key: 'name' },
    { header: 'Website', key: 'website' },
  ];

  it('writes a genuinely empty cell for a blank/null value, not a "—" placeholder', async () => {
    // A literal '—' character would fail a URL/email column's validation on
    // re-import, or overwrite a plain text field with the dash itself
    // instead of clearing it — see xlsx-export.ts's own comment. This is
    // the regression a real Jam.dev bug report caught: exporting then
    // re-importing to update wrote '—' into every previously-blank
    // optional column.
    const buffer = await buildWorkbook('Sheet', columns, [{ name: 'Acme', website: '' }]);
    expect(await readCell(buffer, 2, 1)).toBe('Acme');
    expect(await readCell(buffer, 2, 2)).toBeNull();
  });

  it('also blanks a null value, not just an empty string', async () => {
    const buffer = await buildWorkbook('Sheet', columns, [{ name: 'Acme', website: null }]);
    expect(await readCell(buffer, 2, 2)).toBeNull();
  });

  it('leaves a real value untouched', async () => {
    const buffer = await buildWorkbook('Sheet', columns, [{ name: 'Acme', website: 'https://acme.com' }]);
    expect(await readCell(buffer, 2, 2)).toBe('https://acme.com');
  });
});
