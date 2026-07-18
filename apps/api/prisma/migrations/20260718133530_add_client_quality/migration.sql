-- CreateEnum
CREATE TYPE "ClientQuality" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "quality" "ClientQuality" NOT NULL DEFAULT 'MEDIUM';

-- CreateIndex
CREATE INDEX "Client_quality_idx" ON "Client"("quality");
