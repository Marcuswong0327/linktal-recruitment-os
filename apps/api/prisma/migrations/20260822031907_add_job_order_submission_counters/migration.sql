-- AlterTable
ALTER TABLE "JobOrder" ADD COLUMN     "activeSubmissionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSubmittedAt" TIMESTAMP(3);
