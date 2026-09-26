-- AlterTable
ALTER TABLE "JobOrder" ADD COLUMN "ownerConsultantId" TEXT;

-- Backfill: earliest JobOrderConsultant per job order (by assignedAt, then consultantId).
UPDATE "JobOrder" AS jo
SET "ownerConsultantId" = sub."consultantId"
FROM (
  SELECT DISTINCT ON ("jobOrderId")
    "jobOrderId",
    "consultantId"
  FROM "JobOrderConsultant"
  ORDER BY "jobOrderId", "assignedAt" ASC, "consultantId" ASC
) AS sub
WHERE jo."id" = sub."jobOrderId"
  AND jo."ownerConsultantId" IS NULL;

-- CreateIndex
CREATE INDEX "JobOrder_ownerConsultantId_idx" ON "JobOrder"("ownerConsultantId");

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_ownerConsultantId_fkey" FOREIGN KEY ("ownerConsultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
