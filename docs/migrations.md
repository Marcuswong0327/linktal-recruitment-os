# Database Migrations

How we track, roll out, and roll back schema changes for the Linktal API
(Prisma + PostgreSQL on Neon).

> **Golden rule:** Prisma migrations are **forward-only**. There is no built-in
> `down`. "Rollback" is a workflow (a new forward migration, or a data restore),
> not a button. Design every change with that in mind.

---

## 1. How change tracking works

Two pieces, kept in sync:

| Piece | Where | Role |
|-------|-------|------|
| `apps/api/prisma/migrations/` | git | The ordered, **immutable** history of schema changes. Each change = one timestamped folder with a `migration.sql`. This is the source of truth and your audit trail (via code review + git blame). |
| `_prisma_migrations` table | the database | The DB's memory of which migrations it has applied — name, checksum, `applied_at`, `rolled_back_at`. This is how Prisma knows what's still pending. |

**Never edit a migration `.sql` file once it has been applied/committed.** Prisma
checksums applied migrations; changing one causes history drift. Always add a
*new* migration instead.

---

## 2. Rolling out a change

Example: add an index on `Candidate.currentCompany`.

```bash
cd apps/api

# 1. Edit prisma/schema.prisma
#    @@index([currentCompany])

# 2. Author + apply to your DEV database, naming the change
pnpm prisma migrate dev --name add_candidate_company_index
#    -> creates prisma/migrations/<ts>_add_candidate_company_index/migration.sql
#    -> applies it to the dev DB

# 3. REVIEW the generated migration.sql — this is your migration plan.
#    Confirm it does only what you intended (watch for unexpected DROPs).

# 4. Commit the schema change AND the migration folder together
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): index Candidate.currentCompany"

# 5. Open a PR. CI runs lint/typecheck/build/test.
```

- `migrate dev` = **authoring** command. Local/dev only. Creates the migration,
  uses a shadow DB to detect drift, applies it.
- `migrate deploy` = **release** command. Applies pending migrations only; no
  prompts, no drift detection. This is what runs against staging/prod.

---

## 3. Deploying to production (Railway)

The API is hosted on **Railway**, which deploys via its **GitHub integration** —
not from GitHub Actions. GHA (`.github/workflows/ci.yml`) is only the **gate**
(lint · typecheck · build · test); Railway waits for it, then builds and
releases. This "CI validates, platform deploys" split is the standard pattern.

The full flow:

```
push / merge to main
  → GitHub Actions CI runs (lint · typecheck · build · test)
  → Railway waits for CI to pass ("Wait for CI" enabled)
  → Railway builds the API
  → preDeployCommand:  prisma migrate deploy   (once, before traffic)
  → startCommand:      node dist/main.js        (new version goes live)
  → healthcheck /api/health must pass, else the release is rolled back
```

### Config-as-code: `railway.json` (repo root)

Railway reads `railway.json` on each deploy. The relevant parts:

```jsonc
{
  "build": {
    "buildCommand": "pnpm --filter @linktal/api build"     // prisma generate && nest build
  },
  "deploy": {
    "preDeployCommand": "pnpm --filter @linktal/api prisma:migrate:deploy",
    "startCommand": "pnpm --filter @linktal/api start",     // node dist/main.js
    "healthcheckPath": "/api/health"
  }
}
```

**Migrations run in `preDeployCommand`, not on boot.** This runs `migrate deploy`
exactly **once** per release, **before** the new version serves traffic —
avoiding the multi-instance race you'd get if every booting replica migrated.
Migrations are owned **solely** by `preDeployCommand`; the app's start scripts
(`start` / `start:prod`) only boot the server (`node dist/main.js`) and never
migrate, so there's no double-migrate.

**If `preDeployCommand` (or the healthcheck) fails, Railway aborts the release
and keeps the previous version serving** — the new code never goes live, so a bad
migration doesn't take the app down.

> ⚠️ **Deployment rollback ≠ database rollback.** Railway reverts the *app* to the
> old version, but it cannot undo SQL already run. If a migration failed partway,
> the DB may be partially changed and Prisma marks that migration **failed** in
> `_prisma_migrations`, which **blocks all future deploys** until you resolve it
> (see §4b: clean up the partial SQL, then `migrate resolve --rolled-back`). For
> destructive migrations, take a **Neon snapshot first** (§4c) — that's your only
> real data undo. This is also why **additive / expand-contract** changes matter:
> the old app version keeps running against the new schema during the window.

### One-time Railway dashboard setup (not in the repo)

These can't live in git and must be set once in the Railway service:

1. **Connect the repo** and set the deploy branch to `main`.
2. **Root Directory = `/`** (repo root) — required so the pnpm workspace installs
   correctly. Do *not* set it to `apps/api`.
3. **Enable "Wait for CI"** (Service → Settings → Deploy) and select the CI
   check(s) as required — this is what gates deploys on green tests.
4. **Set environment variables**: `DATABASE_URL`, `DIRECT_URL` (Neon — pooled and
   unpooled), `CORS_ORIGIN`, plus any auth secrets. `PORT` is injected by Railway.

Prod runs **`migrate deploy` only** — never `migrate dev`.

### Alternative: GHA-driven deploy

If you'd rather gate and trigger deploys entirely from code, you can drop the
GitHub integration and add a deploy job that runs the Railway CLI
(`railway up` / `railway redeploy`) after the test job, using a
`RAILWAY_TOKEN` GitHub secret. This keeps the pipeline in the repo but duplicates
what the native integration already does — prefer the native path unless you need
custom orchestration.

---

## 4. Rolling back

Pick the layer that matches the change.

### a. Forward-fix — default for reversible schema changes

The "rollback" is a *new* migration that undoes the previous one. Best for
indexes, added columns, added tables.

```bash
# remove @@index from schema.prisma, then:
pnpm prisma migrate dev --name drop_candidate_company_index
pnpm prisma migrate deploy   # roll the revert forward to prod
```

### b. A deploy that failed mid-flight (partial application)

Prisma does **not** wrap a migration in a transaction by default, so if
`migrate deploy` dies partway, some statements may have already committed (e.g.
2 of 3 indexes created). The migration is marked **failed** in
`_prisma_migrations` and **blocks all further deploys** until you resolve it.
This is recoverable — you have two directions:

Recovery is a **manual, one-off action** (normal deploys are automatic — this
only happens when one fails). Run the commands **against the prod DB from
Railway's environment**, so prod secrets stay in Railway, not on your laptop:

```bash
railway run npx prisma migrate status   # or use Railway's web shell
```
(You can also run raw `DROP INDEX ...` in the Neon SQL editor.)

**Diagnose first:**
```bash
railway run npx prisma migrate status    # shows the failed migration name
# read the deploy logs to see which statement failed
```

**Option 1 — roll back (undo the partial change), then fix & redeploy:**
```bash
# reverse the statements that DID apply. For the index example:
#   DROP INDEX IF EXISTS "Placement_startDate_idx";   (etc.)
npx prisma migrate resolve --rolled-back <migration_name>
# DB is clean again; fix the migration SQL and redeploy.
```

**Option 2 — roll forward (finish it by hand), then mark done:**
```bash
# apply the remaining statements manually (IF NOT EXISTS makes this safe)
npx prisma migrate resolve --applied <migration_name>
```

For **indexes specifically** this is low-risk: they hold no row data, so reverting
is just `DROP INDEX IF EXISTS` and re-running. There is no data to lose.

**Prevent partial application in the first place:**
- **Write idempotent SQL** — `CREATE INDEX IF NOT EXISTS`, `DROP ... IF EXISTS`,
  `ADD COLUMN IF NOT EXISTS`. Re-running a partially-applied migration then just
  completes the missing parts.
- **Wrap the migration in a transaction.** PostgreSQL has transactional DDL, so
  `BEGIN; … COMMIT;` around the body makes it all-or-nothing — a mid-failure
  rolls the whole migration back, leaving no partial state.
  *Exception:* `CREATE INDEX CONCURRENTLY` (and a few others) **cannot** run in a
  transaction — keep those alone in their own migration.
- **One logical change per migration** — smaller blast radius, easier revert.

### c. Destructive changes (dropped column/table) — restore data, don't forward-fix

A forward migration can recreate a dropped column but **not its data**. The only
true rollback is a data-level restore. On Neon:
- **Branch before the deploy**: take a Neon branch (instant copy-on-write
  snapshot). If the migration goes bad, restore from / repoint to the branch.
- **Point-in-time restore**: roll the DB back to a timestamp before the change.

> Mental model: **schema mistake → forward-fix migration. data mistake → Neon
> snapshot / PITR.** Always snapshot before a destructive migration.

### Optional: pre-write a "down" plan per migration

Prisma can *generate* the reverse SQL so a rollback plan ships with the change:

```bash
prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-migrations prisma/migrations \
  --script > down.sql
```

Store it alongside the migration; if ever needed, apply with
`prisma db execute --file down.sql` then `prisma migrate resolve --rolled-back <name>`.

---

## 5. Expand / contract (safe changes under load)

For zero-downtime, never make a breaking change in one step. Split it:

1. **Expand** — add the new column/table (nullable / with default). Deploy.
2. **Migrate data + ship code** that writes both old and new. Backfill.
3. **Contract** — once nothing reads the old shape, drop it (with a snapshot).

This keeps old and new app versions working during the rollout, and makes each
step individually reversible.

---

## 6. Caveats

- **Indexes on large tables** lock writes while building. For big tables use
  `CREATE INDEX CONCURRENTLY`, which Prisma won't emit automatically:
  `migrate dev --create-only`, hand-edit the SQL, then apply. (Not a concern at
  current data size.)
- **Neon uses a pooled + a direct URL.** Migrations need `DIRECT_URL`
  (unpooled); the schema's `directUrl` is already configured for this.
- **One shared dev DB.** History drift on it affects everyone — see the history
  in git for the July 2026 baseline reconciliation for how to fix drift with
  `migrate resolve` + `migrate diff` without dropping data.

---

## Quick reference

| Goal | Command |
|------|---------|
| Author a change (dev) | `pnpm prisma migrate dev --name <change>` |
| Author without applying | `pnpm prisma migrate dev --create-only --name <change>` |
| Apply pending (prod/CI) | `pnpm --filter @linktal/api prisma:migrate:deploy` |
| Check history vs DB | `npx prisma migrate status` |
| Detect drift (DB vs schema) | `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` |
| Mark failed migration rolled back | `npx prisma migrate resolve --rolled-back <name>` |
| Baseline an existing migration as applied | `npx prisma migrate resolve --applied <name>` |
