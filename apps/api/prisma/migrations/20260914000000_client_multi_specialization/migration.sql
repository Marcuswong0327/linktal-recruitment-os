-- Client specialization: single optional FK → many-to-many join table
-- (same shape as CandidateSpecialization). Backfill existing tags first.

CREATE TABLE "ClientSpecialization" (
    "clientId" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,

    CONSTRAINT "ClientSpecialization_pkey" PRIMARY KEY ("clientId","specializationId")
);

CREATE INDEX "ClientSpecialization_specializationId_idx" ON "ClientSpecialization"("specializationId");

ALTER TABLE "ClientSpecialization" ADD CONSTRAINT "ClientSpecialization_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientSpecialization" ADD CONSTRAINT "ClientSpecialization_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ClientSpecialization" ("clientId", "specializationId")
SELECT "id", "specializationId"
FROM "Client"
WHERE "specializationId" IS NOT NULL;

ALTER TABLE "Client" DROP CONSTRAINT "Client_specializationId_fkey";

DROP INDEX "Client_specializationId_idx";

ALTER TABLE "Client" DROP COLUMN "specializationId";
