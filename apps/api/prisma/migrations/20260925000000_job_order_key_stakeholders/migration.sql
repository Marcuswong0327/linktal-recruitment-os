-- CreateTable
CREATE TABLE "JobOrderKeyStakeholder" (
    "jobOrderId" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOrderKeyStakeholder_pkey" PRIMARY KEY ("jobOrderId","stakeholderId")
);

-- CreateIndex
CREATE INDEX "JobOrderKeyStakeholder_stakeholderId_idx" ON "JobOrderKeyStakeholder"("stakeholderId");

-- AddForeignKey
ALTER TABLE "JobOrderKeyStakeholder" ADD CONSTRAINT "JobOrderKeyStakeholder_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderKeyStakeholder" ADD CONSTRAINT "JobOrderKeyStakeholder_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
