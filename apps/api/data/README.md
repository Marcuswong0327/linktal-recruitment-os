# Import source data

Everything the taxonomy import reads lives here. The workbook contains **real
personal data (PII)**, so `.xlsx` files are **git-ignored** (see the root
`.gitignore`) and must never be committed. Only this README is tracked.

## The one-time bulk load — retired

The original Client/Candidate/Stakeholder/Job Order/Job Research/Consultant
data (and the geography tree) came from a one-time load off
`linktal-workbook.xlsx` via `import:workbook`, `import:users` and
`import:locations`. All three scripts, and the GeoNames dumps under
`geonames/`, were retired once that load was done and issue #157 replaced the
GeoNames-scale Location tree with the flat Country / City Coverage catalog —
keeping them around risked someone re-running one and silently reintroducing
2,000+ dead location rows or resurrecting deleted grants.

**Every entity that had an in-app importer keeps using it going forward** —
Companies, Stakeholders, Candidates, Job Orders and Job Research each have a
template-driven Export/Import on their own page (`GET .../import/template`,
`POST .../import`), bundling a Locations reference sheet with the current
Country / City Coverage catalog. That's the only supported way to bulk-add or
bulk-edit those five entities now. Consultants, TOBs, contact history,
submissions, interviews and placements have no bulk importer — at current row
counts (dozens, not thousands) the UI is the only path, and that's fine.

`linktal-workbook.xlsx` itself is left in place on disk (nothing reads it any
more) rather than deleted, since it's the only surviving copy of the original
source data outside the Google Sheet it was exported from.

## What's still live

`import:taxonomy` still reads the workbook (via `scripts/workbook.ts`) for the
Industry/Specialization tabs — that one wasn't retired. `import:industries`
reads `seed-data/industries.csv` instead (not PII, so it's committed).

| Step | Script | Loads |
|---|---|---|
| 1 | `pnpm seed` | RBAC roles + permissions + the 13-row Location catalog |
| 2 | `pnpm import:industries` | Industry catalog |
| 3 | `pnpm import:taxonomy` | Specialization tree |

`readSheet` (in `scripts/workbook.ts`) fetches `linktal-workbook.xlsx` from
the source Google Sheet on first run and caches it here if it isn't already
present; pass `--refresh` to re-download. To read from a different directory
for a one-off run, set `DATA_DIR`.
