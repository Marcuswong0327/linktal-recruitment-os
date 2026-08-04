---
name: create-pr
description: Open a pull request for this repo (linktal-recruitment-os) against main, with repo-specific pre-flight checks and a test-plan checklist. Use when the user asks to create a PR, open a pull request, or ship the current branch. Triggers on "create a PR", "open a PR", "make a pull request", "ship this branch".
allowed-tools: Bash(git *), Bash(gh *), Bash(pnpm *)
---

Opening a PR here means more than `gh pr create` — this repo has a
codegen step (API client) and a docs set that's easy to leave stale.
Run the pre-flight checks below *before* drafting the PR body, and fail
loudly (report to the user, don't silently skip) if any of them fail.

## 1. Pre-flight checks

1. **`git status`** — uncommitted changes shouldn't go into a PR silently.
   If there's dirty work, tell the user; don't auto-commit unless asked.
2. **`pnpm typecheck`** (root — runs both apps via turbo). This repo
   currently has known pre-existing failures in `apps/web/src/features/candidates/*`
   (stale generated API client — see `docs/ux-patterns.md`'s "Known gap"
   section), so "passing" means **no new errors versus `main`**, not zero
   errors. Compare with:
   ```
   git stash && pnpm typecheck > /tmp/pr-baseline-typecheck.txt 2>&1; git stash pop
   pnpm typecheck > /tmp/pr-current-typecheck.txt 2>&1
   diff /tmp/pr-baseline-typecheck.txt /tmp/pr-current-typecheck.txt
   ```
   Only lines that appear in the current run but not the baseline are this
   branch's problem.
3. **`pnpm lint`** (root) — must be clean, no baseline exception here.
4. **`pnpm --filter api test`** if `apps/api/**` changed — this is the only
   app with a Jest suite today.
5. **API client drift** — if the diff touches any
   `apps/api/src/**/*.controller.ts`, `**/dto/*.ts`, or `**/entities/*.ts`
   but `apps/api/openapi.json` / `apps/web/src/lib/api/generated/**` are
   *not* in the same diff, the client is stale. Run `pnpm gen:api` (or
   invoke the `regenerate-api-client` skill) and commit the result before
   opening.
6. **Migrations** — if `apps/api/prisma/schema.prisma` changed, confirm a
   matching migration exists under `apps/api/prisma/migrations/` and skim
   `docs/migrations.md` for the rollout/rollback expectations; flag it in
   the PR body if there's anything the reviewer needs to know before
   deploying (e.g. a backfill, a required env var).
7. **UI/frontend changes** — per this repo's CLAUDE.md, these need to have
   been exercised in a running browser, not just typechecked. Ask the user
   to confirm this happened (or do it yourself via the `run` skill) before
   claiming the test plan item as done — don't check the box on faith.

## 2. Docs that might need updating

Check the diff against this list and flag (don't silently update) any
that likely need a matching doc change:

| Diff touches | Consider updating |
|---|---|
| `RolePermission`/seed.ts / permission checks | `docs/rbac-roles.md` |
| Scope resolver (`common/scope.ts`) / assignment rules | `docs/scope-explained.md` |
| `schema.prisma` | `docs/database-erd.md` |
| A new soft-delete/confirm+undo flow | `docs/ux-patterns.md` |
| Migration rollout/rollback behavior | `docs/migrations.md` |
| Workbook import edge cases | `docs/workbook-import-discrepancies.md` |

## 3. Draft and open the PR

Follow the repo's standard PR flow (same as the top-level "Creating pull
requests" instructions): gather `git status`, `git diff`, `git log
main...HEAD` and `git diff main...HEAD` in parallel to see the *full*
commit range, not just the latest commit. Draft:

- **Title** — under 70 characters, imperative mood, matching this repo's
  commit prefixes (`feat:`, `fix:`, `chore:`, etc. — see the `commit` skill).
- **Body** — Summary (1-3 bullets) + Test plan as a literal markdown
  checklist covering whichever of the pre-flight items above actually
  applied, e.g.:
  ```markdown
  ## Summary
  - ...

  ## Test plan
  - [ ] `pnpm typecheck` — no new errors vs main
  - [ ] `pnpm lint` clean
  - [ ] `pnpm --filter api test` passing
  - [ ] API client regenerated (`pnpm gen:api`)
  - [ ] Verified in browser: <what you clicked through>
  ```
  Only include checklist lines that are actually relevant to this diff —
  an API-only PR doesn't need a browser-verification line, a docs-only PR
  doesn't need any of them.

Push with `-u` if the branch isn't tracked yet, then `gh pr create --title
"..." --body "$(cat <<'EOF' ... EOF)"` against `main` (this repo's base
branch). Return the PR URL.
