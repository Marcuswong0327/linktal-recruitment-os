import * as XLSX from 'xlsx';
import * as path from 'path';

const FILES = [
  '/Users/joelim/Downloads/Icarus Candidate Database.xlsx',
  '/Users/joelim/Downloads/Icarus Client Database.xlsx',
  '/Users/joelim/Downloads/Job Orders Portfolio.xlsx',
];

for (const filePath of FILES) {
  console.log('\n' + '='.repeat(80));
  console.log(`FILE: ${path.basename(filePath)}`);
  console.log('='.repeat(80));

  try {
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      console.log(`\nSheet: "${sheetName}"`);

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

      if (data.length === 0) {
        console.log('  (empty sheet)');
        continue;
      }

      // Show headers (first row)
      const headers = data[0] as string[];
      console.log(`  Rows: ${data.length - 1} (excluding header)`);
      console.log(`  Columns (${headers.length}):`);
      headers.forEach((h, i) => {
        console.log(`    ${i + 1}. ${h || '(empty)'}`);
      });

      // Show sample data (first 2 rows)
      if (data.length > 1) {
        console.log('\n  Sample data (first 2 rows):');
        for (let r = 1; r <= Math.min(2, data.length - 1); r++) {
          console.log(`    Row ${r}:`);
          const row = data[r] as unknown[];
          headers.forEach((h, i) => {
            const val = row[i];
            if (val !== undefined && val !== null && val !== '') {
              console.log(`      ${h || `Col${i}`}: ${val}`);
            }
          });
        }
      }
    }
  } catch (err) {
    console.error(`  Error: ${err}`);
  }
}
