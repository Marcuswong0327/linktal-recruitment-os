# Import source data

Everything the import scripts read lives here. The workbook contains **real
personal data (PII)**, so `.xlsx` files are **git-ignored** (see the root
`.gitignore`) and must never be committed. Only this README is tracked.

## The workbook

`linktal-workbook.xlsx` is fetched from the source Google Sheet on first run and
cached here — nothing needs to be placed by hand. Pass `--refresh` (or set
`WORKBOOK_REFRESH=1`) to re-download it:

```bash
pnpm --filter @linktal/api import:workbook --refresh
```

Its ten tabs are mapped in `scripts/workbook.ts` (`SHEETS`). To read from a
different directory for a one-off run, set `DATA_DIR`.

## Order

Run from `apps/api` (or with `pnpm --filter @linktal/api <script>`). Each step
depends on the ones above it:

| Step | Script | Loads |
|---|---|---|
| 1 | `pnpm seed` | RBAC roles + permissions |
| 2 | `pnpm import:locations` | GeoNames Location tree |
| 3 | `pnpm import:industries` | Industry catalog |
| 4 | `pnpm import:taxonomy` | Specialization tree |
| 5 | `pnpm import:users` | Consultants (from the User List tab) |
| 6 | `pnpm import:workbook` | All business data |

`import:workbook` resolves against steps 1–5 and never creates them. It takes
`--only=<tab>` to run a single tab and `--dry` to parse and report without
writing. Every write is an upsert on `displayId`, so re-running is idempotent.

## Rejects

Anything the importer can't resolve is written to `import-workbook-rejects.csv`
here, grouped by cause, rather than guessed at. See
`docs/workbook-import-discrepancies.md` for what each category means and which
ones need a decision.

## Obsolete

`scripts/import-excel.ts`, `scripts/import-placements.ts`,
`scripts/debug-placements.ts` and `scripts/inspect-excel.ts` read three
per-entity files (`Icarus Candidate Database.xlsx`, `Icarus Client
Database.xlsx`, `Job Orders Portfolio.xlsx`) that predate the single-workbook
source and no longer exist — against a schema that no longer exists either.
Superseded by `import:workbook`; safe to delete.
