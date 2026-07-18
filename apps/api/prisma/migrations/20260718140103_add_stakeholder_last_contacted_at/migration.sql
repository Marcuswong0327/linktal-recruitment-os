-- AlterTable
ALTER TABLE "Stakeholder" ADD COLUMN     "lastContactedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Stakeholder_lastContactedAt_idx" ON "Stakeholder"("lastContactedAt");
