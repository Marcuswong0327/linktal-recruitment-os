-- Candidate.industry/roleType: free text -> reference tables (Industry is
-- shared with Client; CandidateRoleType is a new, candidate-scoped catalog).
-- Candidate.specializations: JSONB string array -> many-to-many via
-- CandidateSpecialization (Specialization is shared with Client too).
-- Existing distinct values become/top-up the catalog rows, and every
-- Candidate is repointed before the old columns are dropped. New
-- Candidate.skills (free-entry JSONB tags, no catalog) and
-- CandidateSavedSearch are purely additive — no backfill needed.

CREATE TABLE "CandidateRoleType" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateRoleType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateRoleType_name_key" ON "CandidateRoleType"("name");

CREATE TABLE "CandidateSpecialization" (
    "candidateId" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,

    CONSTRAINT "CandidateSpecialization_pkey" PRIMARY KEY ("candidateId", "specializationId")
);

CREATE INDEX "CandidateSpecialization_specializationId_idx" ON "CandidateSpecialization"("specializationId");

CREATE TABLE "CandidateSavedSearch" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSavedSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateSavedSearch_consultantId_idx" ON "CandidateSavedSearch"("consultantId");

-- Backfill catalogs from whatever's already in use on Candidate. Industry and
-- Specialization are shared with Client, so only top up names Client hasn't
-- already contributed.
INSERT INTO "Industry" ("name", "updatedAt")
SELECT DISTINCT c."industry", CURRENT_TIMESTAMP
FROM "Candidate" c
WHERE c."industry" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Industry" i WHERE i."name" = c."industry");

INSERT INTO "CandidateRoleType" ("name", "updatedAt")
SELECT DISTINCT "roleType", CURRENT_TIMESTAMP FROM "Candidate" WHERE "roleType" IS NOT NULL;

INSERT INTO "Specialization" ("name", "updatedAt")
SELECT DISTINCT s.name, CURRENT_TIMESTAMP
FROM "Candidate" c, jsonb_array_elements_text(c."specializations") AS s(name)
WHERE c."specializations" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Specialization" sp WHERE sp."name" = s.name);

-- Add the new FK columns + skills, point every Candidate at its matching
-- catalog row, populate the specialization join table, then drop the old
-- free-text/JSON columns.
ALTER TABLE "Candidate" ADD COLUMN "industryId" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "roleTypeId" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "skills" JSONB;

UPDATE "Candidate" SET "industryId" = "Industry"."id"
FROM "Industry" WHERE "Candidate"."industry" = "Industry"."name";

UPDATE "Candidate" SET "roleTypeId" = "CandidateRoleType"."id"
FROM "CandidateRoleType" WHERE "Candidate"."roleType" = "CandidateRoleType"."name";

INSERT INTO "CandidateSpecialization" ("candidateId", "specializationId")
SELECT DISTINCT c."id", sp."id"
FROM "Candidate" c, jsonb_array_elements_text(c."specializations") AS s(name)
JOIN "Specialization" sp ON sp."name" = s.name
WHERE c."specializations" IS NOT NULL;

ALTER TABLE "Candidate" DROP COLUMN "industry";
ALTER TABLE "Candidate" DROP COLUMN "roleType";
ALTER TABLE "Candidate" DROP COLUMN "specializations";

ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_roleTypeId_fkey" FOREIGN KEY ("roleTypeId") REFERENCES "CandidateRoleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CandidateSpecialization" ADD CONSTRAINT "CandidateSpecialization_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSpecialization" ADD CONSTRAINT "CandidateSpecialization_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateSavedSearch" ADD CONSTRAINT "CandidateSavedSearch_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Candidate_industryId_idx" ON "Candidate"("industryId");
CREATE INDEX "Candidate_roleTypeId_idx" ON "Candidate"("roleTypeId");
