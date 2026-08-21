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

### Two services, two config files

This is a monorepo with **two Railway services**, each with its own config file
at the repo root (set per service via Settings → *Config-as-code file path*):

| Service | Config file | Runs migrations? |
|---------|-------------|:----------------:|
| API (NestJS) | `railway.api.json` | **yes** — `preDeployCommand` |
| Web (Next.js) | `railway.web.json` | **no** |

> ⚠️ Both services' *Config-as-code file path* must be set **explicitly** —
> Railway only auto-detects a file literally named `railway.json`, which neither
> of these is. Leaving the path blank means Railway falls back to zero-config
> auto-detection and silently drops `preDeployCommand`, the healthcheck, and the
> restart policy. Set the API service to `/railway.api.json` and the web service
> to `/railway.web.json`.

### Two environments, one shared dev DB

Railway has two environments for this project:

| Environment | Branch | Neon DB | Runs `migrate deploy`? |
|-------------|--------|---------|:----:|
| production | `main` | prod Neon DB | **yes** |
| dev | `dev` | the **same shared dev Neon DB** used locally | **no** |

The dev environment intentionally does **not** run `prisma migrate deploy` on
release. It uses the same shared dev database everyone migrates locally with
`pnpm prisma migrate dev` (see §6) — by the time a change reaches the `dev`
branch, the migration has already been authored and applied against that DB.
Re-running `migrate deploy` there would (at best) be a no-op and (at worst) race
a teammate's local `migrate dev` shadow-DB check. Production is the only
environment where `migrate deploy` runs automatically.

This is enforced by an `$RAILWAY_ENVIRONMENT_NAME` check inside `railway.api.json`'s
`preDeployCommand` (see below). If a database migration needs to reach the dev
environment without a teammate running `migrate dev` locally first, run it by
hand: `railway run --environment dev -- pnpm --filter @linktal/api prisma:migrate:deploy`.

### API config: `railway.api.json`

Railway reads it on each deploy. The relevant parts:

```jsonc
{
  "build": {
    "buildCommand": "pnpm --filter @linktal/api build"     // prisma generate && nest build
  },
  "deploy": {
    "preDeployCommand": "if [ \"$RAILWAY_ENVIRONMENT_NAME\" = \"production\" ]; then pnpm --filter @linktal/api prisma:migrate:deploy; fi",
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
migrate, so there's no double-migrate. The `$RAILWAY_ENVIRONMENT_NAME` guard
additionally scopes that single run to the production environment only — see
"Two environments, one shared dev DB" above.

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
- **One shared dev DB.** History drift on it affects everyone — see §7 for the
  July 2026 baseline squash, which fixed drift with `migrate resolve` +
  `migrate diff` without dropping data. Railway's **dev environment reads from
  this same DB** and does not run `migrate deploy` on its own (§3) — migrations
  reach it only via a teammate's local `migrate dev`, so a broken local
  migration is everyone's problem immediately, not just at deploy time.
- **`displayId` sequences don't move on their own.** They only advance on
  `nextval()` — the DB default every app-level create goes through. Any
  bulk/raw load that writes `displayId` explicitly (a workbook re-import, a
  restore from a Neon branch/PITR) leaves the sequence behind the table's real
  max, and the next app-created row on that table then collides
  (`P2002`/`displayId` unique violation). Run
  `pnpm --filter @linktal/api resync:display-ids` right after any such load; add
  `--check` to a health check or CI step to catch drift without writing
  anything. See `docs/database-erd.md`'s displayId section.

---

## 7. Squashing / baselining history (July 2026)

**What happened:** the migrations folder had drifted from the database. The only
migration on record (`20260708160230_init_with_display_ids`) replayed to an
**older** shape than `schema.prisma` — the `Stakeholder` / `StakeholderContactHistory`
models had been reshaped and money fields changed `Decimal → Float` via an
out-of-band `db push`, so those edits were live in the DB but never captured as a
migration. Result: `migrate dev` shadow-replayed the old migration, saw the
mismatch, and demanded a **full database reset** ("All data will be lost") on
every run — even though the live DB actually matched `schema.prisma`.

**Fix (data-preserving squash):** the history was collapsed into a single
baseline that reproduces the current schema, then marked as already-applied:

```bash
cd apps/api

# 1. Generate a baseline that recreates the whole current schema from empty
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

# 2. Remove the old, out-of-sync migration folders (keep migration_lock.toml)
#    rm -rf prisma/migrations/<old_ts>_*

# 3. Clear Prisma's bookkeeping table ONLY — no real data is touched
echo 'DELETE FROM "_prisma_migrations";' > /tmp/clear.sql
npx prisma db execute --file /tmp/clear.sql --schema prisma/schema.prisma

# 4. Record the baseline as already-applied against the live DB
npx prisma migrate resolve --applied 0_init
```

Verified afterwards: `migrate status` → "up to date", `migrate dev` → "Already in
sync", and row counts unchanged (100 clients / 132 stakeholders / 68 job orders /
103 candidates). Going forward `migrate dev` generates clean incremental
migrations with no drift warnings.

> ⚠️ **This squash rewrote history: `init_with_display_ids` no longer exists.**
> - **Fresh database** (new clone, new environment, CI ephemeral DB): nothing to
>   do — `migrate deploy` just runs `0_init` from scratch.
> - **Existing database** (another dev DB, a personal clone, prod) that already
>   had the old migration applied: do **not** run `migrate deploy` — it will try
>   to re-run `0_init` on tables that already exist and fail. Instead re-baseline
>   it the same way: clear its `_prisma_migrations` rows for the old migration(s)
>   and run `npx prisma migrate resolve --applied 0_init`. Only then are future
>   `migrate deploy`s safe.
>
> Because a squash is disruptive to anyone with an existing DB, avoid repeating
> it — prefer normal incremental migrations from here on.

---

## 8. Automated backups (R2, 30-day rolling retention)

§4c's Neon branch/PITR guidance is the *surgical* tool: taken deliberately,
right before a specific risky migration. This section is the *standing*
tool: an unattended nightly job that guarantees a rollback point exists for
**any** of the last 30 days, whether or not anyone remembered to branch first.
Neither replaces the other — keep branching before destructive migrations
even with this in place.

**Production only.** The shared dev DB (§3) is expected to be messy and
frequently reset — that's normal there, not an incident, so it isn't backed
up by this job.

### What runs

`.github/workflows/db-backup.yml` — scheduled nightly (16:07 UTC = just after
midnight Malaysia Time) plus `workflow_dispatch` for an on-demand run. It's
plain shell, no app toolchain: `pg_dump -Fc` piped straight through the AWS
CLI (preinstalled on GitHub's runners; R2 is S3-API-compatible) into R2, no
local file ever staged on the runner. The only setup step is installing a
matching PostgreSQL 18 client (Neon's server version) from the official PGDG
apt repo. It snapshots **unconditionally, every night, with no
change-detection**: a same-content dump costs pennies in compressed object
storage, while a missed snapshot on a day that *did* change is exactly the
failure this system exists to prevent — the two risks aren't remotely
symmetric, so there's no attempt to skip "unchanged" days.

The cron is `7 16 * * *`, not `0 16 * * *` — deliberately off the hour.
GitHub's own docs warn the `schedule` event is delayed most "at the start of
every hour," the single most congested minute across all of GitHub Actions; a
few minutes off it clears most of that queueing.

30-day retention is enforced by an **R2 bucket lifecycle rule** (Cloudflare
dashboard → the bucket → Lifecycle Rules → expire objects under the
`backups/` prefix after 30 days) — not by anything in this repo. One less
script to trust.

### Is it actually running? (`db-backup-check.yml`)

`schedule` triggers are best-effort — GitHub can delay one, and rarely, drop
one entirely, with **no notification either way**. `db-backup-check.yml`
closes that gap: it runs daily (08:00 UTC = 16:00 Malaysia Time, well after
the previous midnight's backup should have landed) and reads the
`backups/_last-success` marker `db-backup.yml` writes on every successful
run. If that marker is more than 36h old, the check job fails on purpose.

A **failing scheduled GitHub Actions run notifies you automatically** —
email/GitHub notifications, per your own notification settings for this repo
— so this needs no separate Slack webhook or alerting service; a red run in
the Actions tab (and the notification GitHub already sends for it) *is* the
alert. If it fires: check `db-backup.yml`'s own run history for what went
wrong, then trigger it manually (`workflow_dispatch`) to catch up immediately
rather than waiting for the next scheduled attempt.

### Secrets this needs (GitHub → repo → Settings → Secrets and variables → Actions)

| Secret | What it is |
|---|---|
| `PROD_DIRECT_URL` | Production Neon's **unpooled** connection string. Named `PROD_…`, not reused from `DIRECT_URL`, specifically so it can never be confused with the shared dev DB's connection string when someone's setting this up. |
| `R2_ACCOUNT_ID` | Cloudflare account ID (used to build the R2 endpoint URL). |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | An R2 API token scoped to just the backup bucket (Cloudflare dashboard → R2 → Manage API Tokens). |
| `R2_BUCKET` | The bucket name. |
| `RESTORE_TARGET_URL` | Restore-only (see below) — update it right before each restore run. |

GitHub secrets are **write-only**: once saved, nobody — including the repo
owner — can view the value again, only overwrite it. If a credential is lost,
generate a new one at the source (Cloudflare, Neon) and overwrite the secret;
there's no "retrieve."

### Restore runbook

Restoring is manual-trigger-only (`db-restore.yml`, `workflow_dispatch` with
a `date` input) and deliberately never touches production directly:

1. In the Neon console, create a scratch branch/database to restore into.
2. Update the `RESTORE_TARGET_URL` secret to that scratch DB's connection
   string.
3. Run `db-restore.yml` with the date you want (`YYYY-MM-DD`, matching a
   `backups/<date>.dump` object in R2).
4. The job downloads that dump and runs `pg_restore` into
   `RESTORE_TARGET_URL`, then prints a row-count summary — **review this
   before trusting the restore.**
5. If it looks right, promote it by hand: update Railway's `DATABASE_URL`/
   `DIRECT_URL` env vars to the scratch DB and redeploy the API service.
   This step is intentionally not automated — a bad restore should never be
   able to silently become live traffic.

Do one real test restore periodically (not just when something's already on
fire) — an untested backup isn't a backup.

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
| Run a backup manually | GitHub → Actions → "DB Backup" → Run workflow |
| Restore a backup into a scratch DB | GitHub → Actions → "DB Restore (manual)" → Run workflow, enter the date |
| Check whether the last backup is stale right now | GitHub → Actions → "DB Backup Staleness Check" → Run workflow |
| Baseline an existing migration as applied | `npx prisma migrate resolve --applied <name>` |
