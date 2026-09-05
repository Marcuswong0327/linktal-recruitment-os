import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  ImportColumn,
  buildLocationPathIndex,
  buildLocationReferenceSheet,
  buildNameIndex,
  buildNameReferenceSheet,
  buildSpecializationReferenceSheet,
  buildTemplateWorkbook,
  chunk,
  findInFileDuplicates,
  parseWorkbook,
} from './xlsx-import';

const COLUMNS: ImportColumn[] = [
  { header: 'Display ID', key: 'displayId' },
  { header: 'Company Name', key: 'companyName', required: true },
  { header: 'Website', key: 'website' },
];

/** Builds a minimal .xlsx buffer with the given header row + data rows, for round-tripping through parseWorkbook. */
async function makeWorkbookBuffer(headers: string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('parseWorkbook', () => {
  it('parses data rows against the expected columns, matching headers case-insensitively and order-independently', async () => {
    const buffer = await makeWorkbookBuffer(
      ['website', 'DISPLAY ID', 'Company Name'], // shuffled order, mixed case
      [['https://acme.com', 'CLI-000001', 'Acme Corp']],
    );
    const { rows, headerErrors } = await parseWorkbook(buffer, COLUMNS);
    expect(headerErrors).toEqual([]);
    expect(rows).toEqual([
      { rowNumber: 2, cells: { displayId: 'CLI-000001', companyName: 'Acme Corp', website: 'https://acme.com' } },
    ]);
  });

  it('matches a required column whose header still carries the template\'s own " *" marker — the untouched-download-then-fill-in-then-upload flow', async () => {
    // buildTemplateWorkbook writes a required column's header as "Company
    // Name *" (see REQUIRED_HEADER_SUFFIX) — a template downloaded, filled
    // in, and uploaded without anyone editing the header row (the normal,
    // expected flow) must still match, or every required column fails the
    // header check on every brand-new-row import, every time.
    const buffer = await makeWorkbookBuffer(
      ['Display ID', 'Company Name *', 'Website'],
      [['', 'Acme Corp', 'https://acme.com']],
    );
    const { rows, headerErrors } = await parseWorkbook(buffer, COLUMNS);
    expect(headerErrors).toEqual([]);
    expect(rows[0].cells.companyName).toBe('Acme Corp');
  });

  it('rejects a file that is not a real .xlsx workbook with a clean 400, not an uncaught crash', async () => {
    // A CSV (or any non-OOXML content) saved/renamed with an .xlsx
    // extension — ExcelJS throws loading this; real-world repro from a jam
    // recording where the uploaded file was actually a .csv wearing an
    // .xlsx name.
    const notAWorkbook = Buffer.from('Display ID,Company Name\n,Acme Corp\n', 'utf-8');
    await expect(parseWorkbook(notAWorkbook, COLUMNS)).rejects.toThrow(BadRequestException);
  });

  it('reports a header error when an expected column is missing, and returns no rows', async () => {
    const buffer = await makeWorkbookBuffer(['Display ID', 'Website'], [['CLI-000001', 'https://acme.com']]);
    const { rows, headerErrors } = await parseWorkbook(buffer, COLUMNS);
    expect(rows).toEqual([]);
    expect(headerErrors).toEqual([expect.stringContaining('Company Name')]);
  });

  it('skips a fully blank row rather than treating it as a data row', async () => {
    const buffer = await makeWorkbookBuffer(
      ['Display ID', 'Company Name', 'Website'],
      [
        ['', 'Acme Corp', ''],
        ['', '', ''],
        ['', 'Beta LLC', ''],
      ],
    );
    const { rows } = await parseWorkbook(buffer, COLUMNS);
    expect(rows.map((r) => r.cells.companyName)).toEqual(['Acme Corp', 'Beta LLC']);
  });

  it('assigns the literal Excel row number, header row is row 1', async () => {
    const buffer = await makeWorkbookBuffer(
      ['Display ID', 'Company Name', 'Website'],
      [
        ['', 'Acme Corp', ''],
        ['', 'Beta LLC', ''],
      ],
    );
    const { rows } = await parseWorkbook(buffer, COLUMNS);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3]);
  });
});

describe('findInFileDuplicates', () => {
  it('flags every row sharing the same non-blank displayId', () => {
    const errors = findInFileDuplicates([
      { rowNumber: 2, displayId: 'CLI-000001' },
      { rowNumber: 3, displayId: 'CLI-000002' },
      { rowNumber: 4, displayId: 'CLI-000001' },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.row).sort()).toEqual([2, 4]);
    expect(errors[0].column).toBe('Display ID');
  });

  it('does not flag blank-displayId rows against each other', () => {
    const errors = findInFileDuplicates([
      { rowNumber: 2, displayId: '' },
      { rowNumber: 3, displayId: '' },
    ]);
    expect(errors).toEqual([]);
  });

  it('does not flag a displayId that appears only once', () => {
    const errors = findInFileDuplicates([
      { rowNumber: 2, displayId: 'CLI-000001' },
      { rowNumber: 3, displayId: 'CLI-000002' },
    ]);
    expect(errors).toEqual([]);
  });
});

describe('buildNameIndex', () => {
  it('lowercases the stored key, so a caller who also lowercases their lookup gets a case-insensitive-but-exact match', () => {
    const index = buildNameIndex([{ id: 'i1', name: 'Manufacturing' }]);
    expect(index.get('manufacturing')).toBe('i1');
    expect(index.get('MANUFACTURING'.toLowerCase())).toBe('i1');
    expect(index.get('manufactur')).toBeUndefined(); // exact match only, never a prefix/fuzzy match
  });
});

describe('buildLocationPathIndex', () => {
  it('keys by lowercased bare name — Location.name is globally unique', () => {
    const index = buildLocationPathIndex([
      { id: 'au', name: 'Australia', ancestorIds: ['au'] },
      { id: 'syd', name: 'Sydney NSW', ancestorIds: ['syd', 'au'] },
    ]);
    expect(index.get('sydney nsw')).toBe('syd');
    expect(index.get('australia')).toBe('au');
  });
});

describe('buildNameReferenceSheet', () => {
  it('produces a single "Name" column, sorted alphabetically', () => {
    const sheet = buildNameReferenceSheet('Industries', [{ name: 'Manufacturing' }, { name: 'Construction' }]);
    expect(sheet.title).toBe('Industries');
    expect(sheet.columns).toEqual([{ header: 'Name', key: 'name' }]);
    expect(sheet.rows.map((r) => r.name)).toEqual(['Construction', 'Manufacturing']);
  });
});

describe('buildSpecializationReferenceSheet', () => {
  it('pairs each Specialization with its own Industry, sorted by industry then name', () => {
    const sheet = buildSpecializationReferenceSheet([
      { name: 'Food Bakery', industry: { name: 'Food' } },
      { name: 'Civil', industry: { name: 'Construction' } },
      { name: 'Food Meat', industry: { name: 'Food' } },
    ]);
    expect(sheet.columns).toEqual([
      { header: 'Industry', key: 'industryName' },
      { header: 'Specialization', key: 'name' },
    ]);
    expect(sheet.rows).toEqual([
      { industryName: 'Construction', name: 'Civil' },
      { industryName: 'Food', name: 'Food Bakery' },
      { industryName: 'Food', name: 'Food Meat' },
    ]);
  });
});

describe('buildLocationReferenceSheet', () => {
  const FIXTURE = [
    { id: 'au', name: 'Australia', ancestorIds: ['au'], level: 'COUNTRY', parentId: null },
    { id: 'syd', name: 'Sydney NSW', ancestorIds: ['syd', 'au'], level: 'CITY_COVERAGE', parentId: 'au' },
  ];

  it('includes every row with its own name and country', () => {
    const sheet = buildLocationReferenceSheet(FIXTURE);
    expect(sheet.columns).toEqual([
      { header: 'Location', key: 'name' },
      { header: 'Country', key: 'country' },
      { header: 'Level', key: 'level' },
    ]);
    expect(sheet.rows).toEqual(
      expect.arrayContaining([
        { name: 'Australia', country: '', level: 'COUNTRY' },
        { name: 'Sydney NSW', country: 'Australia', level: 'CITY_COVERAGE' },
      ]),
    );
    expect(sheet.rows).toHaveLength(2);
  });

  // The regression guard the design explicitly called for: the string a user
  // would copy from this sheet must be byte-identical (case aside) to what
  // buildLocationPathIndex keys its matcher on for the same row — otherwise
  // a copy-paste from the reference sheet could fail to validate.
  it('produces names identical (case aside) to what buildLocationPathIndex matches on', () => {
    const sheet = buildLocationReferenceSheet(FIXTURE);
    const index = buildLocationPathIndex(FIXTURE);
    for (const row of sheet.rows as { name: string }[]) {
      expect(index.get(row.name.toLowerCase())).toBeDefined();
    }
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups, preserving order, with a partial last group', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single group when items fit within one chunk', () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });

  it('returns no groups for an empty input', () => {
    expect(chunk([], 100)).toEqual([]);
  });
});

describe('buildTemplateWorkbook', () => {
  it('produces a workbook with a Data sheet (required columns starred) and an Instructions sheet', async () => {
    const buffer = await buildTemplateWorkbook('Companies', COLUMNS, ['Some extra instruction.']);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const dataSheet = workbook.getWorksheet('Companies');
    expect(dataSheet).toBeDefined();
    expect(dataSheet!.getRow(1).getCell(2).value).toBe('Company Name *'); // required column starred

    const infoSheet = workbook.getWorksheet('Instructions');
    expect(infoSheet).toBeDefined();
    const infoText = Array.from({ length: infoSheet!.rowCount }, (_, i) => infoSheet!.getCell(i + 1, 1).value).join(' ');
    expect(infoText).toContain('Some extra instruction.');
    expect(infoText).toContain('Display ID');
    expect(infoText).toContain('Export to Excel');
  });

  it('round-trips through parseWorkbook untouched — the real "download, fill in, upload" flow', async () => {
    // The template's own Data sheet, with its required-column "*" markers
    // baked into the header row, fed straight into parseWorkbook with no
    // header edits at all — this is what actually happens when someone
    // downloads the template, fills in a row, and uploads it right back.
    const buffer = await buildTemplateWorkbook('Companies', COLUMNS, []);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const dataSheet = workbook.getWorksheet('Companies')!;
    dataSheet.getRow(2).values = ['', 'Acme Corp', 'https://acme.com'];

    const refilled = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, headerErrors } = await parseWorkbook(refilled, COLUMNS);
    expect(headerErrors).toEqual([]);
    expect(rows).toEqual([
      { rowNumber: 2, cells: { displayId: '', companyName: 'Acme Corp', website: 'https://acme.com' } },
    ]);
  });

  it('consolidates multiple reference sheets into one Instructions line, not one per sheet', async () => {
    const buffer = await buildTemplateWorkbook('Companies', COLUMNS, [], [
      { title: 'Industries', columns: [{ header: 'Name', key: 'name' }], rows: [{ name: 'Manufacturing' }] },
      { title: 'Locations', columns: [{ header: 'Path', key: 'path' }], rows: [{ path: 'Australia' }] },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const infoSheet = workbook.getWorksheet('Instructions')!;
    const lines = Array.from({ length: infoSheet.rowCount }, (_, i) => String(infoSheet.getCell(i + 1, 1).value ?? ''));

    const seeLines = lines.filter((l) => l.startsWith('See the'));
    expect(seeLines).toHaveLength(1);
    expect(seeLines[0]).toContain('"Industries"');
    expect(seeLines[0]).toContain('"Locations"');
    // Never the old per-sheet wording that falsely claimed every reference sheet is about Display IDs.
    expect(lines.join(' ')).not.toContain('Display IDs referenced above');
  });

  it('omits the "See the ... sheet" line entirely when there are no reference sheets', async () => {
    const buffer = await buildTemplateWorkbook('Companies', COLUMNS, []);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const infoSheet = workbook.getWorksheet('Instructions')!;
    const lines = Array.from({ length: infoSheet.rowCount }, (_, i) => String(infoSheet.getCell(i + 1, 1).value ?? ''));
    expect(lines.some((l) => l.startsWith('See the'))).toBe(false);
  });

  describe('dropdown validation', () => {
    const DROPDOWN_COLUMNS: ImportColumn[] = [
      { header: 'Display ID', key: 'displayId' },
      { header: 'Status', key: 'status', required: true, dropdown: { kind: 'inline', values: ['COLD', 'WARM'] } },
      {
        header: 'Industry',
        key: 'industry',
        required: true,
        dropdown: { kind: 'reference', sheetTitle: 'Industries', columnKey: 'name' },
      },
    ];
    const REFERENCE_SHEETS = [
      { title: 'Industries', columns: [{ header: 'Name', key: 'name' }], rows: [{ name: 'Manufacturing' }, { name: 'Construction' }] },
    ];

    it('applies an inline list dropdown directly, with no named range or reference sheet needed', async () => {
      const buffer = await buildTemplateWorkbook('Companies', DROPDOWN_COLUMNS, []);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const dataSheet = workbook.getWorksheet('Companies')!;
      const validation = dataSheet.getCell('B2').dataValidation;
      expect(validation).toMatchObject({ type: 'list', formulae: ['"COLD,WARM"'] });
    });

    it('wires a reference-column dropdown to a named range covering that reference sheet\'s data rows', async () => {
      const buffer = await buildTemplateWorkbook('Companies', DROPDOWN_COLUMNS, [], REFERENCE_SHEETS);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      const definedName = workbook.definedNames.model.find((d) => d.name.includes('Industries'));
      expect(definedName?.ranges).toEqual(['Industries!$A$2:$A$3']); // 2 data rows + header

      const dataSheet = workbook.getWorksheet('Companies')!;
      const validation = dataSheet.getCell('C2').dataValidation;
      expect(validation?.type).toBe('list');
      expect(validation?.formulae?.[0]).toBe(definedName?.name);
    });

    it('extends the dropdown range down to MAX_IMPORT_ROWS + 1, not just the visibly-filled rows', async () => {
      const buffer = await buildTemplateWorkbook('Companies', DROPDOWN_COLUMNS, [], REFERENCE_SHEETS);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const dataSheet = workbook.getWorksheet('Companies')!;
      // Spot-check a far-down row still carries the same dropdown.
      const validation = dataSheet.getCell('B500').dataValidation;
      expect(validation).toMatchObject({ type: 'list', formulae: ['"COLD,WARM"'] });
    });

    it('does not create a named range for an empty reference sheet', async () => {
      const buffer = await buildTemplateWorkbook('Companies', DROPDOWN_COLUMNS, [], [
        { title: 'Industries', columns: [{ header: 'Name', key: 'name' }], rows: [] },
      ]);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      expect(workbook.definedNames.model).toEqual([]);
    });

    it('wires a dropdown to a reference sheet whose title contains spaces (e.g. "Job Role Types")', async () => {
      const columns: ImportColumn[] = [
        { header: 'Display ID', key: 'displayId' },
        { header: 'Job Role Type', key: 'jobRoleType', dropdown: { kind: 'reference', sheetTitle: 'Job Role Types', columnKey: 'name' } },
      ];
      const buffer = await buildTemplateWorkbook('Candidates', columns, [], [
        { title: 'Job Role Types', columns: [{ header: 'Name', key: 'name' }], rows: [{ name: 'Electrician' }] },
      ]);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      const definedName = workbook.definedNames.model.find((d) => d.name.includes('JobRoleTypes'));
      expect(definedName?.ranges).toEqual(["'Job Role Types'!$A$2"]);

      const dataSheet = workbook.getWorksheet('Candidates')!;
      const validation = dataSheet.getCell('B2').dataValidation;
      expect(validation?.type).toBe('list');
      expect(validation?.formulae?.[0]).toBe(definedName?.name);
    });

    it('lists dropdown-enabled columns by name in the Instructions sheet', async () => {
      const buffer = await buildTemplateWorkbook('Companies', DROPDOWN_COLUMNS, [], REFERENCE_SHEETS);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const infoSheet = workbook.getWorksheet('Instructions')!;
      const infoText = Array.from({ length: infoSheet.rowCount }, (_, i) => infoSheet.getCell(i + 1, 1).value).join(' ');
      expect(infoText).toContain('dropdown');
      expect(infoText).toContain('Status');
      expect(infoText).toContain('Industry');
    });
  });
});
