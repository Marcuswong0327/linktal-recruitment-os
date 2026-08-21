# Linktal Recruitment OS

A TypeScript monorepo:

| App          | Path       | Stack                                                                        | Deploy  |
| ------------ | ---------- | ---------------------------------------------------------------------------- | ------- |
| Web frontend | `apps/web` | Next.js (App Router) · Tailwind CSS · Zod + React Hook Form · TanStack Query | Railway |
| API backend  | `apps/api` | NestJS · Prisma ORM · PostgreSQL (Neon)                                      | Railway |

Tooling: **pnpm workspaces** + **Turborepo**. CI runs on **GitHub Actions**.

The repo ships a small end-to-end vertical slice — a `Candidate` resource — so the
Web → API → Postgres path works out of the box.

---

## Prerequisites

- Node.js 20+ (`.nvmrc` pins 20)
- pnpm 9 — `corepack enable && corepack prepare pnpm@9.15.0 --activate`
- A [Neon](https://neon.tech) PostgreSQL database (free tier is fine)

## Getting started

```bash
pnpm install

# 1. Configure the API
cp apps/api/.env.example apps/api/.env
#   → paste your Neon DATABASE_URL (pooled) and DIRECT_URL (unpooled)

# 2. Configure the Web app
cp apps/web/.env.example apps/web/.env.local

# 3. Create the database schema
pnpm --filter @linktal/api prisma:migrate   # runs `prisma migrate dev`

# 4. Run everything (web on :3000, api on :3001)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api (health check at `/api/health`)

## Monorepo scripts (run from the root)

| Command          | What it does                                                      |
| ---------------- | ----------------------------------------------------------------- |
| `pnpm dev`       | Runs `web` and `api` in watch mode via Turborepo                  |
| `pnpm build`     | Builds every app (`prisma generate` + `nest build`, `next build`) |
| `pnpm lint`      | Lints every app                                                   |
| `pnpm typecheck` | `tsc --noEmit` in every app                                       |
| `pnpm test`      | Runs unit tests                                                   |
| `pnpm format`    | Prettier write across the repo                                    |

Target a single app with a filter, e.g. `pnpm --filter @linktal/api dev`.

## Project layout

```
.
├── apps/
│   ├── web/                  # Next.js frontend
│   │   ├── src/app/          # App Router (layout, page, providers)
│   │   ├── src/features/     # candidates: schema (zod) + hooks (query) + form/list
│   │   └── src/lib/api.ts    # typed fetch wrapper → API
│   └── api/                  # NestJS backend
│       ├── prisma/schema.prisma
│       └── src/
│           ├── candidates/   # controller · service · DTOs
│           ├── prisma/       # global Prisma module + service
│           └── health/
├── .github/workflows/
│   ├── ci.yml                # lint · typecheck · build · test
│   ├── db-backup.yml         # nightly production DB backup -> R2
│   ├── db-restore.yml        # manual-trigger restore into a scratch DB
│   └── keep-alive.yml        # monthly commit, keeps scheduled workflows enabled
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Database (Neon)

1. Create a project at [neon.tech](https://neon.tech) and copy the connection strings.
2. In `apps/api/.env`:
   - `DATABASE_URL` — the **pooled** string (host contains `-pooler`), used at runtime.
   - `DIRECT_URL` — the **direct/unpooled** string, used by Prisma Migrate.
3. Apply migrations locally with `pnpm --filter @linktal/api prisma:migrate`.

### Automated backups

`.github/workflows/db-backup.yml` snapshots the **production** Neon DB to
Cloudflare R2 every night (16:00 UTC = midnight Malaysia Time), unconditionally
— no change-detection, since a same-content dump costs pennies while a missed
snapshot on a day that did change is the failure this exists to prevent.
30-day rolling retention is enforced by an R2 bucket lifecycle rule, not by
the workflow itself.

`.github/workflows/db-restore.yml` is manual-trigger-only
(`workflow_dispatch`, pick a date) and restores into a scratch Neon
branch/DB you provision yourself — it never touches production directly;
promoting a restore to production stays a deliberate manual step.

`.github/workflows/keep-alive.yml` pushes one trivial commit monthly, purely
so GitHub's 60-day-inactivity auto-disable (which would otherwise silently
turn off the nightly backup schedule during a long quiet period) never
kicks in — a schedule *running* doesn't reset that clock, only a real push
does.

Full runbook, required secrets, and the restore procedure: `docs/migrations.md` §8.

## Deployment (Railway)

Each app is a **separate Railway service** pointing at this repo, deployed into two
Railway environments: `production` (tracks `main`) and `dev` (tracks `dev`). GitHub
Actions runs the CI checks in parallel; Railway waits for them before deploying. See
`docs/migrations.md` for the full flow, including why the dev environment doesn't
run `prisma migrate deploy`.

### One-time Railway setup (per service)

For **both** the `web` and `api` services, in the service **Settings**:

- **Root Directory:** `/` (the repo root — pnpm needs the workspace lockfile)
- **Config-as-code path** (must be set explicitly — Railway only auto-detects a
  file literally named `railway.json`, and neither of these is):
  - API service → `/railway.api.json`
  - Web service → `/railway.web.json`

  These are root-level files (not `apps/api/railway.json` / `apps/web/railway.json` —
  those don't exist; Root Directory is `/`, so Railway only ever looks at the repo
  root). They already define the pnpm-filtered build/start commands and health checks.

### Environment variables (set in Railway)

**API service**

| Var                  | Value                                                        |
| -------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`       | Neon pooled connection string                                |
| `DIRECT_URL`         | Neon direct connection string                                |
| `CORS_ORIGIN`        | Your web service URL, e.g. `https://web-xxxx.up.railway.app` |
| `AZURE_TENANT_ID`    | Client's Azure Tenant ID                                     |
| `AZURE_CLIENT_ID`    | Linktal Recruitment OS App Registration (Client Id)          |
| `JWT_ACCESS_SECRET`  | Own API access token                                         |
| `JWT_REFRESH_SECRET` | Own API refresh token                                        |

> `railway.api.json`'s `preDeployCommand` runs `prisma migrate deploy` once, before
> the new version takes traffic — production only. The dev environment skips
> it (see `docs/migrations.md`). The start command itself never migrates.

**Web service**

| Var                              | Value                                                                     |
| -------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`            | Your API service URL + `/api`, e.g. `https://api-xxxx.up.railway.app/api` |
| `AUTH_SECRET`                    | Something here                                                            |
| `AUTH_MICROSOFT_ENTRA_ID_ID `    | Same as `AZURE_CLIENT_ID`                                                 |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Client Secret Value (will expire in 2 years)                              |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Microsoft's Authentication Endpoint with Tenant ID                        |
| `AUTH_URL`                       | Deployed frontend URL                                                     |
| `API_INTERNAL_URL `              | Used for NextAuth and runs on server side                                 |

### CI Flow

`.github/workflows/ci.yml` runs on every push/PR to `main` or `dev`: install →
build → lint → typecheck → test. Railway handles the actual deploy on merge
to `main` (production) or `dev` (the shared dev environment — see
`docs/migrations.md` for why it skips `prisma migrate deploy`).
