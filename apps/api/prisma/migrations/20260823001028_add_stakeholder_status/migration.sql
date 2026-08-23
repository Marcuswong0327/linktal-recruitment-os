-- CreateEnum
CREATE TYPE "StakeholderStatus" AS ENUM ('COLD', 'WARM', 'UNS', 'DATA_NOT_ACCURATE');

-- AlterTable
ALTER TABLE "Stakeholder" ADD COLUMN     "status" "StakeholderStatus" NOT NULL DEFAULT 'COLD';
