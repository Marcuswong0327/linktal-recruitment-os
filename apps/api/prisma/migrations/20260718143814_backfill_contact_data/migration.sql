-- Data-only migration (no schema change). Backfills what the ad-hoc dev
-- scripts populated by hand this session, so a fresh database (prod) ends up
-- in the same state via the normal `prisma migrate deploy` step — no manual
-- script to remember. Every write below is idempotent (guarded by
-- "...IS NULL"), safe to have already run once (e.g. on the shared dev DB).

-- ============================================================================
-- 1. Seed the StakeholderRoleType catalog
-- ============================================================================

INSERT INTO "StakeholderRoleType" (id, name, "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Director', true, now(), now()),
  (gen_random_uuid()::text, 'Hiring Manager', true, now(), now()),
  (gen_random_uuid()::text, 'HR', true, now(), now()),
  (gen_random_uuid()::text, 'Talent Acquisition', true, now(), now()),
  (gen_random_uuid()::text, 'Operations', true, now(), now()),
  (gen_random_uuid()::text, 'Finance', true, now(), now()),
  (gen_random_uuid()::text, 'Department Head', true, now(), now()),
  (gen_random_uuid()::text, 'Other', true, now(), now())
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. Classify existing (non-deleted) stakeholders' jobTitle into a role type.
--    Mirrors apps/api/src/stakeholders/role-type-classifier.ts: checked in
--    priority order, first match wins ("roleTypeId" IS NULL guard), functional
--    keywords (HR/Talent Acquisition/Finance/Operations) before generic
--    seniority terms (Director/Head of). Not authoritative — roleType stays
--    independently editable to correct a bad guess.
-- ============================================================================

UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'HR')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL
  AND s."jobTitle" ~* '\y(hr|human resources|people\s*(&|and)?\s*culture)\y';

UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'Talent Acquisition')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL
  AND s."jobTitle" ~* '\y(talent acquisition|recruiter|recruitment|sourcing|ta lead)\y';

UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'Finance')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL
  AND s."jobTitle" ~* '\y(finance|financial|cfo|accountant|accounting)\y';

UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'Operations')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL
  AND s."jobTitle" ~* '\y(operations|ops)\y';

UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'Hiring Manager')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL
  AND s."jobTitle" ~* '\yhiring manager\y';

UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'Department Head')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL
  AND s."jobTitle" ~* '\y(head of|department head)\y';

UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'Director')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL
  AND s."jobTitle" ~* '\y(director|chief|vp|vice president)\y';

-- Catch-all: no keyword match (incl. null jobTitle) -> Other.
UPDATE "Stakeholder" s
SET "roleTypeId" = (SELECT id FROM "StakeholderRoleType" WHERE name = 'Other')
FROM "Client" c
WHERE s."clientId" = c.id
  AND s."deletedAt" IS NULL AND c."deletedAt" IS NULL
  AND s."roleTypeId" IS NULL;

-- ============================================================================
-- 3. Stakeholder.lastContactedAt = max(StakeholderContactHistory.contactedAt)
-- ============================================================================

UPDATE "Stakeholder" s
SET "lastContactedAt" = sub.max_contacted_at
FROM (
  SELECT "stakeholderId", MAX("contactedAt") AS max_contacted_at
  FROM "StakeholderContactHistory"
  GROUP BY "stakeholderId"
) sub
WHERE s.id = sub."stakeholderId"
  AND s."lastContactedAt" IS NULL
  AND s."deletedAt" IS NULL;

-- ============================================================================
-- 4. Client.lastContactedAt = max(contactedAt) across all its stakeholders
-- ============================================================================

UPDATE "Client" c
SET "lastContactedAt" = sub.max_contacted_at
FROM (
  SELECT s."clientId", MAX(ch."contactedAt") AS max_contacted_at
  FROM "StakeholderContactHistory" ch
  JOIN "Stakeholder" s ON s.id = ch."stakeholderId"
  WHERE s."deletedAt" IS NULL
  GROUP BY s."clientId"
) sub
WHERE c.id = sub."clientId"
  AND c."lastContactedAt" IS NULL
  AND c."deletedAt" IS NULL;

-- Note: Candidate.lastContactedAt, Candidate.consultantId,
-- StakeholderContactHistory.contactedById, and CandidateContactHistory have
-- no historical data to backfill from — nothing tracked "who" before this
-- schema change, so those simply start empty and fill in going forward.
