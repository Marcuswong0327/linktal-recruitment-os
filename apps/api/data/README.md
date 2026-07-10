# Import source data

The Excel workbooks the import scripts read live in this directory. They are the
raw client/candidate exports and contain **real personal data (PII)**, so the
`.xlsx` files are **git-ignored** (see the root `.gitignore`) and must never be
committed. Only this README is tracked.

## Expected files

Place these here (exact names):

- `Icarus Candidate Database.xlsx`
- `Icarus Client Database.xlsx`
- `Job Orders Portfolio.xlsx`

To use a different location for a one-off run, set `DATA_DIR`:

```bash
DATA_DIR=/path/to/xlsx pnpm --filter @linktal/api import:excel
```

## Scripts

Run from `apps/api` (or with `pnpm --filter @linktal/api <script>`):

| Script | Purpose |
|--------|---------|
| `pnpm inspect:excel` | Print sheet names + column headers (no DB writes) |
| `pnpm import:excel` | Import candidates, clients and job orders |
| `pnpm import:placements` | Import submissions and placements |

> Run `pnpm seed` first to create RBAC roles/permissions, then the imports.
