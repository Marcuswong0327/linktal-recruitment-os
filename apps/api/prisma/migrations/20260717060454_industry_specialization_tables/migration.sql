-- Client.industry/specialization: free text -> reference tables (Industry,
-- Specialization), referenced by FK. Existing distinct text values become the
-- initial catalog rows, and every Client is repointed to the matching row
-- before the old text columns are dropped.

CREATE TABLE "Industry" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Industry_name_key" ON "Industry"("name");

CREATE TABLE "Specialization" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Specialization_name_key" ON "Specialization"("name");

-- Backfill the catalog from whatever's already in use.
INSERT INTO "Industry" ("name", "updatedAt")
SELECT DISTINCT "industry", CURRENT_TIMESTAMP FROM "Client" WHERE "industry" IS NOT NULL;

INSERT INTO "Specialization" ("name", "updatedAt")
SELECT DISTINCT "specialization", CURRENT_TIMESTAMP FROM "Client" WHERE "specialization" IS NOT NULL;

-- Add the FK columns, point every Client at its matching catalog row, then
-- drop the old free-text columns.
ALTER TABLE "Client" ADD COLUMN "industryId" TEXT;
ALTER TABLE "Client" ADD COLUMN "specializationId" TEXT;

UPDATE "Client" SET "industryId" = "Industry"."id"
FROM "Industry" WHERE "Client"."industry" = "Industry"."name";

UPDATE "Client" SET "specializationId" = "Specialization"."id"
FROM "Specialization" WHERE "Client"."specialization" = "Specialization"."name";

ALTER TABLE "Client" DROP COLUMN "industry";
ALTER TABLE "Client" DROP COLUMN "specialization";

ALTER TABLE "Client" ADD CONSTRAINT "Client_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Client_industryId_idx" ON "Client"("industryId");
CREATE INDEX "Client_specializationId_idx" ON "Client"("specializationId");
