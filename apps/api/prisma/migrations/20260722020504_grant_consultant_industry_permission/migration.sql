-- Data-only migration (no schema change). Adds the consultant_industry
-- permission (read + update only, per prisma/seed.ts's READ_UPDATE_RESOURCES
-- category) and grants it to admin + manager, matching prisma/seed.ts's
-- ROLE_PERMISSIONS matrix -- without touching any other role's permissions.
--
-- Written as a targeted migration instead of requiring a `pnpm seed` run:
-- the seed script fully reconciles every built-in role (admin/manager/
-- consultant/finance/researcher/viewer) by deleting and recreating ALL of
-- its RolePermission rows from the matrix in code, on every run -- so
-- running it just to add this one new resource would also silently wipe out
-- any permission grant an admin has since made to a built-in role via the
-- Roles admin UI that isn't also reflected in that file (see
-- docs/rbac-roles.md, section 3). This migration only INSERTs the two new
-- rows, leaving every other role's existing permissions untouched, and runs
-- automatically via the normal `prisma migrate deploy` release step -- no
-- manual step to remember (same reasoning as
-- 20260722003742_backfill_consultant_industries).
--
-- Idempotent (ON CONFLICT DO NOTHING), safe to have already run once -- e.g.
-- via `pnpm --filter @linktal/api seed`, which now also includes this grant
-- in its own matrix and will leave it as-is on any future re-run.

INSERT INTO "Permission" (id, resource, action, description)
VALUES
  (gen_random_uuid()::text, 'consultant_industry', 'read', 'read consultant_industry'),
  (gen_random_uuid()::text, 'consultant_industry', 'update', 'update consultant_industry')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO "RolePermission" (id, "roleId", "permissionId")
SELECT gen_random_uuid()::text, r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.name IN ('admin', 'manager')
  AND p.resource = 'consultant_industry'
  AND p.action IN ('read', 'update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
