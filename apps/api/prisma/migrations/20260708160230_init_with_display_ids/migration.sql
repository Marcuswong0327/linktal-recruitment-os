-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('COLD', 'WARM', 'TRADED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('COLD', 'WARM', 'HOT', 'PLACED');

-- CreateEnum
CREATE TYPE "JobOrderStatus" AS ENUM ('ACTIVE', 'PLACED', 'CLOSED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'INTERVIEWING', 'REJECTED', 'PLACED');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('PERCENTAGE', 'FLAT');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('PHONE', 'EMAIL', 'WHATSAPP', 'LINKEDIN', 'IN_PERSON');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "country" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "suburb" TEXT,
    "specializations" JSONB,
    "website" TEXT,
    "linkedInUrl" TEXT,
    "feePercentage" DECIMAL(5,2),
    "feeSchedule" TEXT,
    "guaranteePeriod" INTEGER NOT NULL DEFAULT 90,
    "status" "ClientStatus" NOT NULL DEFAULT 'COLD',
    "latestContactDate" TIMESTAMP(3),
    "latestContactBy" TEXT,
    "consultantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stakeholder" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "givenName" TEXT,
    "familyName" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "linkedInUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Cold',
    "lastContactDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderContactHistory" (
    "id" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "contactDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactMethod" "ContactMethod" NOT NULL,
    "notes" TEXT,
    "outcome" TEXT,
    "followUpDate" TIMESTAMP(3),
    "contactedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeholderContactHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientJobResearch" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobDescription" TEXT,
    "salaryRange" TEXT,
    "location" TEXT,
    "sourceUrl" TEXT,
    "sourceType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Prospect',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientJobResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "givenName" TEXT,
    "familyName" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "linkedInUrl" TEXT,
    "seekTalentUrl" TEXT,
    "country" TEXT,
    "city" TEXT,
    "suburb" TEXT,
    "industry" TEXT,
    "roleType" TEXT,
    "currentPosition" TEXT,
    "specializations" JSONB,
    "workHistory" JSONB,
    "rawResumeUrl" TEXT,
    "editedResumeUrl" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'COLD',
    "contactedBy" TEXT,
    "lastScreenedAt" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3),
    "consultantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateScreeningHistory" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "screenedBy" TEXT,
    "notes" JSONB,
    "outcome" TEXT,
    "salaryExpectation" DECIMAL(12,2),
    "noticePeriod" TEXT,
    "availableFrom" TIMESTAMP(3),
    "willingToRelocate" BOOLEAN,
    "consultantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateScreeningHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrder" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientJobResearchId" TEXT,
    "consultantId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobDescription" TEXT,
    "location" TEXT,
    "roleType" TEXT,
    "salaryMin" DECIMAL(12,2),
    "salaryMax" DECIMAL(12,2),
    "salaryCurrency" TEXT NOT NULL DEFAULT 'AUD',
    "numberOfOpenings" INTEGER NOT NULL DEFAULT 1,
    "placedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "JobOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" TEXT,
    "lastSubmissionDate" TIMESTAMP(3),
    "lastActivityDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSubmission" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" TEXT,
    "resumeVersion" TEXT,
    "coverNote" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "interviewDate" TIMESTAMP(3),
    "interviewNotes" TEXT,
    "rejectionReason" TEXT,
    "clientResponseDate" TIMESTAMP(3),
    "clientFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "superPercentage" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "totalPackage" DECIMAL(12,2) NOT NULL,
    "feePercentage" DECIMAL(5,2) NOT NULL,
    "feeValue" DECIMAL(12,2) NOT NULL,
    "feeType" "FeeType" NOT NULL DEFAULT 'PERCENTAGE',
    "offerDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "guaranteeEndDate" TIMESTAMP(3) NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'ACTIVE',
    "isWithinGuarantee" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_displayId_key" ON "Consultant"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_userId_key" ON "Consultant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_displayId_key" ON "Client"("displayId");

-- CreateIndex
CREATE INDEX "Client_displayId_idx" ON "Client"("displayId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_industry_idx" ON "Client"("industry");

-- CreateIndex
CREATE INDEX "Client_consultantId_idx" ON "Client"("consultantId");

-- CreateIndex
CREATE UNIQUE INDEX "Stakeholder_displayId_key" ON "Stakeholder"("displayId");

-- CreateIndex
CREATE INDEX "Stakeholder_displayId_idx" ON "Stakeholder"("displayId");

-- CreateIndex
CREATE INDEX "Stakeholder_clientId_idx" ON "Stakeholder"("clientId");

-- CreateIndex
CREATE INDEX "StakeholderContactHistory_stakeholderId_idx" ON "StakeholderContactHistory"("stakeholderId");

-- CreateIndex
CREATE INDEX "StakeholderContactHistory_contactDate_idx" ON "StakeholderContactHistory"("contactDate");

-- CreateIndex
CREATE INDEX "ClientJobResearch_clientId_idx" ON "ClientJobResearch"("clientId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_status_idx" ON "ClientJobResearch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_displayId_key" ON "Candidate"("displayId");

-- CreateIndex
CREATE INDEX "Candidate_displayId_idx" ON "Candidate"("displayId");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_industry_idx" ON "Candidate"("industry");

-- CreateIndex
CREATE INDEX "Candidate_consultantId_idx" ON "Candidate"("consultantId");

-- CreateIndex
CREATE INDEX "CandidateScreeningHistory_candidateId_idx" ON "CandidateScreeningHistory"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateScreeningHistory_screenedAt_idx" ON "CandidateScreeningHistory"("screenedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobOrder_displayId_key" ON "JobOrder"("displayId");

-- CreateIndex
CREATE INDEX "JobOrder_displayId_idx" ON "JobOrder"("displayId");

-- CreateIndex
CREATE INDEX "JobOrder_clientId_idx" ON "JobOrder"("clientId");

-- CreateIndex
CREATE INDEX "JobOrder_consultantId_idx" ON "JobOrder"("consultantId");

-- CreateIndex
CREATE INDEX "JobOrder_status_idx" ON "JobOrder"("status");

-- CreateIndex
CREATE INDEX "CandidateSubmission_candidateId_idx" ON "CandidateSubmission"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateSubmission_jobOrderId_idx" ON "CandidateSubmission"("jobOrderId");

-- CreateIndex
CREATE INDEX "CandidateSubmission_status_idx" ON "CandidateSubmission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSubmission_candidateId_jobOrderId_key" ON "CandidateSubmission"("candidateId", "jobOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_displayId_key" ON "Placement"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_submissionId_key" ON "Placement"("submissionId");

-- CreateIndex
CREATE INDEX "Placement_displayId_idx" ON "Placement"("displayId");

-- CreateIndex
CREATE INDEX "Placement_status_idx" ON "Placement"("status");

-- CreateIndex
CREATE INDEX "Placement_startDate_idx" ON "Placement"("startDate");

-- CreateIndex
CREATE INDEX "Placement_guaranteeEndDate_idx" ON "Placement"("guaranteeEndDate");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderContactHistory" ADD CONSTRAINT "StakeholderContactHistory_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJobResearch" ADD CONSTRAINT "ClientJobResearch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateScreeningHistory" ADD CONSTRAINT "CandidateScreeningHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateScreeningHistory" ADD CONSTRAINT "CandidateScreeningHistory_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_clientJobResearchId_fkey" FOREIGN KEY ("clientJobResearchId") REFERENCES "ClientJobResearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSubmission" ADD CONSTRAINT "CandidateSubmission_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSubmission" ADD CONSTRAINT "CandidateSubmission_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CandidateSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
