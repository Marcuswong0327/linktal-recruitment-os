-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "ancestorIds" TEXT[];

-- AlterTable
ALTER TABLE "Specialization" ADD COLUMN     "ancestorIds" TEXT[];

-- CreateIndex
CREATE INDEX "Location_ancestorIds_idx" ON "Location" USING GIN ("ancestorIds");

-- CreateIndex
CREATE INDEX "Specialization_ancestorIds_idx" ON "Specialization" USING GIN ("ancestorIds");

