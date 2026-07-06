# Linktal Recruitment OS

A TypeScript monorepo:

| App          | Path        | Stack                                                                 | Deploy   |
| ------------ | ----------- | --------------------------------------------------------------------- | -------- |
| Web frontend | `apps/web`  | Next.js (App Router) · Tailwind CSS · Zod + React Hook Form · TanStack Query | Railway  |
| API backend  | `apps/api`  | NestJS · Prisma ORM · PostgreSQL (Neon)                               | Railway  |

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

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `pnpm dev`        | Runs `web` and `api` in watch mode via Turborepo      |
| `pnpm build`      | Builds every app (`prisma generate` + `nest build`, `next build`) |
| `pnpm lint`       | Lints every app                                       |
| `pnpm typecheck`  | `tsc --noEmit` in every app                           |
| `pnpm test`       | Runs unit tests                                       |
| `pnpm format`     | Prettier write across the repo                        |

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
├── .github/workflows/ci.yml  # lint · typecheck · build · test
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

## Deployment (Railway)

Each app is a **separate Railway service** pointing at this repo. Railway auto-deploys
on every push to `main`; GitHub Actions runs the CI checks in parallel.

### One-time Railway setup (per service)

For **both** the `web` and `api` services, in the service **Settings**:

- **Root Directory:** `/` (the repo root — pnpm needs the workspace lockfile)
- **Config-as-code path:**
  - API service → `apps/api/railway.json`
  - Web service → `apps/web/railway.json`

  These files already define the pnpm-filtered build/start commands and health checks.

### Environment variables (set in Railway)

**API service**
| Var            | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| `DATABASE_URL` | Neon pooled connection string                               |
| `DIRECT_URL`   | Neon direct connection string                               |
| `CORS_ORIGIN`  | Your web service URL, e.g. `https://web-xxxx.up.railway.app` |

> The API start command runs `prisma migrate deploy` before booting, so schema
> changes ship automatically on deploy.

**Web service**
| Var                   | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL` | Your API service URL + `/api`, e.g. `https://api-xxxx.up.railway.app/api` |

### CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: install → build →
lint → typecheck → test. Railway handles the actual deploy on merge to `main`.
