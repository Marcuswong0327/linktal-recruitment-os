-- Scope simplification: drop single-owner consultantId on Client/Candidate/
-- JobOrder in favour of pure industry/location list-filtering, plus a new
-- many-to-many JobOrderConsultant join table (multiple consultants can work
-- one job order concurrently; being on it is the deliberate way to reach an
-- otherwise out-of-scope Client/Candidate).
--
-- Client/Candidate.consultantId are 100% null in this DB (0 assigned rows),
-- so those two drops lose no data. JobOrder.consultantId has 10 assigned
-- rows, so JobOrderConsultant is created and backfilled from it BEFORE the
-- column is dropped.

BEGIN;

-- ---------------------------------------------------------------------------
-- Client: drop consultantId (no data — 0/1645 assigned)
-- ---------------------------------------------------------------------------
ALTER TABLE "Client" DROP CONSTRAINT "Client_consultantId_fkey";
DROP INDEX "Client_consultantId_idx";
ALTER TABLE "Client" DROP COLUMN "consultantId";

-- ---------------------------------------------------------------------------
-- Candidate: drop consultantId (no data — 0/3960 assigned)
-- ---------------------------------------------------------------------------
ALTER TABLE "Candidate" DROP CONSTRAINT "Candidate_consultantId_fkey";
DROP INDEX "Candidate_consultantId_idx";
ALTER TABLE "Candidate" DROP COLUMN "consultantId";

-- ---------------------------------------------------------------------------
-- JobOrderConsultant: new many-to-many join table
-- ---------------------------------------------------------------------------
CREATE TABLE "JobOrderConsultant" (
    "jobOrderId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOrderConsultant_pkey" PRIMARY KEY ("jobOrderId","consultantId")
);

CREATE INDEX "JobOrderConsultant_consultantId_idx" ON "JobOrderConsultant"("consultantId");

ALTER TABLE "JobOrderConsultant" ADD CONSTRAINT "JobOrderConsultant_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobOrderConsultant" ADD CONSTRAINT "JobOrderConsultant_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from JobOrder.consultantId BEFORE it's dropped below.
INSERT INTO "JobOrderConsultant" ("jobOrderId", "consultantId", "assignedAt")
SELECT "id", "consultantId", now() FROM "JobOrder" WHERE "consultantId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- JobOrder: drop the now-superseded single-owner column
-- ---------------------------------------------------------------------------
ALTER TABLE "JobOrder" DROP CONSTRAINT "JobOrder_consultantId_fkey";
DROP INDEX "JobOrder_consultantId_idx";
ALTER TABLE "JobOrder" DROP COLUMN "consultantId";

COMMIT;
