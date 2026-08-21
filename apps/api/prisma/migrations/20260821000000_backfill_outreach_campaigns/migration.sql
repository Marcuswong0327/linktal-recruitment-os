-- Backfills the migration history for the outreach-campaigns feature
-- (EmailTemplate, OutreachCampaign, OutreachCampaignRecipient), which was
-- already applied directly to the shared dev database (via `db push` or raw
-- SQL, not `migrate dev`) before this migration existed — `prisma migrate
-- status` already shows the tracked history as up to date, and this file's
-- CREATE statements match the live DB's actual structure exactly (verified
-- via `prisma migrate diff` against it, zero remaining difference).
--
-- On the shared dev DB, this migration is applied via `prisma migrate
-- resolve --applied` (bookkeeping only — the tables already exist, so this
-- SQL is never actually executed there). On a genuinely fresh database (a
-- new environment, CI, someone's first `migrate deploy`), this SQL runs for
-- real and creates the tables from scratch, same as any other migration.
--
-- No NestJS module/controller/service for this feature exists in this repo
-- yet — only the schema. See schema.prisma's OUTREACH CAMPAIGNS section.

BEGIN;

-- ---------------------------------------------------------------------------
-- Sequences backing the displayId columns below (EMT-000###, OCH-000###) —
-- same convention as every other entity, see 0_init.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE "EmailTemplate_displayId_seq" AS integer;
CREATE SEQUENCE "OutreachCampaign_displayId_seq" AS integer;

-- ---------------------------------------------------------------------------
-- CreateEnum
-- ---------------------------------------------------------------------------
CREATE TYPE "OutreachCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'COMPLETED', 'FAILED');

-- ---------------------------------------------------------------------------
-- CreateTable
-- ---------------------------------------------------------------------------
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT display_id('EMT-'::text, '"EmailTemplate_displayId_seq"'::regclass),
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT display_id('OCH-'::text, '"OutreachCampaign_displayId_seq"'::regclass),
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "timezoneRegion" TEXT NOT NULL DEFAULT 'MY',
    "sendDaysPerWeek" INTEGER NOT NULL DEFAULT 5,
    "senderAccountIds" JSONB NOT NULL DEFAULT '[]',
    "status" "OutreachCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "smartleadCampaignId" TEXT,
    "createdById" TEXT NOT NULL,
    "launchedAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stakeholderId" TEXT,
    "firstName" TEXT,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateIndex
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "EmailTemplate_displayId_key" ON "EmailTemplate"("displayId");
CREATE INDEX "EmailTemplate_createdById_idx" ON "EmailTemplate"("createdById");
CREATE INDEX "EmailTemplate_updatedAt_idx" ON "EmailTemplate"("updatedAt");

CREATE UNIQUE INDEX "OutreachCampaign_displayId_key" ON "OutreachCampaign"("displayId");
CREATE INDEX "OutreachCampaign_createdAt_idx" ON "OutreachCampaign"("createdAt");
CREATE INDEX "OutreachCampaign_createdById_idx" ON "OutreachCampaign"("createdById");
CREATE INDEX "OutreachCampaign_status_idx" ON "OutreachCampaign"("status");

CREATE UNIQUE INDEX "OutreachCampaignRecipient_campaignId_emailNormalized_key" ON "OutreachCampaignRecipient"("campaignId", "emailNormalized");
CREATE INDEX "OutreachCampaignRecipient_stakeholderId_idx" ON "OutreachCampaignRecipient"("stakeholderId");

-- ---------------------------------------------------------------------------
-- AddForeignKey
-- ---------------------------------------------------------------------------
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachCampaignRecipient" ADD CONSTRAINT "OutreachCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachCampaignRecipient" ADD CONSTRAINT "OutreachCampaignRecipient_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
