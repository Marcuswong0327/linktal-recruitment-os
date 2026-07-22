-- Data-only migration (no schema change). Backfills each active
-- `consultant`-role Consultant's ConsultantIndustry rows from the industries
-- already tagged on the companies they currently own, so a fresh database
-- (prod) ends up correctly scoped via the normal `prisma migrate deploy`
-- step -- no manual script to remember (same reasoning as
-- 20260718143814_backfill_contact_data). Idempotent (ON CONFLICT DO
-- NOTHING), safe to have already run once -- e.g. on the shared dev DB via
-- `pnpm --filter @linktal/api backfill:consultant-industries`, the
-- equivalent standalone script this was ported from (kept for its
-- per-consultant logging, not required for deploys).
--
-- Rollout safety this exists for: the `consultant` role's read scoping is
-- strict, no null-passthrough (see docs/rbac-roles.md, section 3) -- a consultant
-- with zero ConsultantIndustry rows would see empty lists for
-- Clients/Candidates/Stakeholders/Job Orders the moment that scoping ships.
-- A consultant who owns zero tagged companies is left with zero industries
-- (nothing to infer) -- an admin tops them up manually afterward.

INSERT INTO "ConsultantIndustry" ("consultantId", "industryId")
SELECT DISTINCT c.id, cl."industryId"
FROM "Consultant" c
JOIN "Role" r ON r.id = c."roleId" AND r.name = 'consultant'
JOIN "Client" cl ON cl."consultantId" = c.id
WHERE c."isActive" = true
  AND cl."industryId" IS NOT NULL
  AND cl."deletedAt" IS NULL
ON CONFLICT ("consultantId", "industryId") DO NOTHING;
