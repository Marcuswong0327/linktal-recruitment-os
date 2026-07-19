-- AlterTable
ALTER TABLE "Stakeholder" ADD COLUMN     "roleTypeId" TEXT;

-- CreateTable
CREATE TABLE "StakeholderRoleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeholderRoleType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderRoleType_name_key" ON "StakeholderRoleType"("name");

-- CreateIndex
CREATE INDEX "Stakeholder_roleTypeId_idx" ON "Stakeholder"("roleTypeId");

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_roleTypeId_fkey" FOREIGN KEY ("roleTypeId") REFERENCES "StakeholderRoleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
