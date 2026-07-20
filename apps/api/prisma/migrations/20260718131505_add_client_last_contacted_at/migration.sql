-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "lastContactedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Industry" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Specialization" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Client_lastContactedAt_idx" ON "Client"("lastContactedAt");
