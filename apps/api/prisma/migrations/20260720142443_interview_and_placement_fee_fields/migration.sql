-- CreateEnum
CREATE TYPE "PlacementFeeType" AS ENUM ('PERCENTAGE', 'FLAT');

-- CreateEnum
CREATE TYPE "InterviewOutcome" AS ENUM ('SCHEDULED', 'PENDING', 'PASSED', 'FAILED', 'CANCELLED');

-- AlterTable
-- Placement has zero live rows (no API/UI ever existed for it), so this
-- drop+recreate of salary/fee -> baseSalary/feeValue is safe.
ALTER TABLE "Placement" DROP COLUMN "fee",
DROP COLUMN "salary",
ADD COLUMN     "accountsNotified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "baseSalary" DOUBLE PRECISION,
ADD COLUMN     "feeType" "PlacementFeeType" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "feeValue" DOUBLE PRECISION,
ADD COLUMN     "superPercentage" DOUBLE PRECISION NOT NULL DEFAULT 12,
ADD COLUMN     "totalPackage" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "roundLabel" TEXT NOT NULL,
    "interviewDate" TIMESTAMP(3) NOT NULL,
    "outcome" "InterviewOutcome" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_submissionId_idx" ON "Interview"("submissionId");

-- CreateIndex
CREATE INDEX "Interview_interviewDate_idx" ON "Interview"("interviewDate");

-- CreateIndex
CREATE INDEX "Interview_deletedAt_idx" ON "Interview"("deletedAt");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CandidateSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
