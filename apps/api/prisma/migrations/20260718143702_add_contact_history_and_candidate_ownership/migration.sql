-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "consultantId" TEXT,
ADD COLUMN     "lastContactedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StakeholderContactHistory" ADD COLUMN     "contactedById" TEXT;

-- CreateTable
CREATE TABLE "CandidateContactHistory" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "contactedById" TEXT,
    "notes" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateContactHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateContactHistory_candidateId_idx" ON "CandidateContactHistory"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateContactHistory_contactedById_idx" ON "CandidateContactHistory"("contactedById");

-- CreateIndex
CREATE INDEX "Candidate_consultantId_idx" ON "Candidate"("consultantId");

-- CreateIndex
CREATE INDEX "Candidate_lastContactedAt_idx" ON "Candidate"("lastContactedAt");

-- CreateIndex
CREATE INDEX "StakeholderContactHistory_contactedById_idx" ON "StakeholderContactHistory"("contactedById");

-- AddForeignKey
ALTER TABLE "StakeholderContactHistory" ADD CONSTRAINT "StakeholderContactHistory_contactedById_fkey" FOREIGN KEY ("contactedById") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateContactHistory" ADD CONSTRAINT "CandidateContactHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateContactHistory" ADD CONSTRAINT "CandidateContactHistory_contactedById_fkey" FOREIGN KEY ("contactedById") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
