/*
  Warnings:

  - You are about to drop the column `jobType` on the `JobOrder` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "JobOrderQuality" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "CandidateRoleType" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CandidateSavedSearch" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "JobOrder" DROP COLUMN "jobType",
ADD COLUMN     "quality" "JobOrderQuality" NOT NULL DEFAULT 'MEDIUM';

-- CreateIndex
CREATE INDEX "JobOrder_quality_idx" ON "JobOrder"("quality");
