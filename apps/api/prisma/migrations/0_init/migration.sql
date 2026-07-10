-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

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
    "neonUserId" TEXT,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "industry" TEXT,
    "country" TEXT,
    "city" TEXT,
    "website" TEXT,
    "tobSigned" BOOLEAN NOT NULL DEFAULT false,
    "feePercentage" DOUBLE PRECISION,
    "guaranteePeriod" INTEGER NOT NULL DEFAULT 90,
    "status" "ClientStatus" NOT NULL DEFAULT 'COLD',
    "notes" TEXT,
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
    "jobTitle" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderContactHistory" (
    "id" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "notes" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeholderContactHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientJobResearch" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "salaryRange" TEXT,
    "notes" TEXT,
    "isContacted" BOOLEAN NOT NULL DEFAULT false,
    "researchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "country" TEXT,
    "city" TEXT,
    "industry" TEXT,
    "roleType" TEXT,
    "currentPosition" TEXT,
    "currentCompany" TEXT,
    "yearsExperience" INTEGER,
    "salaryExpectation" TEXT,
    "linkedinUrl" TEXT,
    "resumeUrl" TEXT,
    "workHistory" JSONB,
    "specializations" JSONB,
    "status" "CandidateStatus" NOT NULL DEFAULT 'COLD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateScreeningHistory" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "notes" JSONB,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateScreeningHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrder" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "consultantId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "jobType" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT DEFAULT 'AUD',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "filledCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "requirements" TEXT,
    "status" "JobOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "priorityLevel" INTEGER DEFAULT 2,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSubmission" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "displayId" TEXT,
    "submissionId" TEXT NOT NULL,
    "salary" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "guaranteeEndDate" TIMESTAMP(3),
    "fee" DOUBLE PRECISION,
    "feePercentage" DOUBLE PRECISION,
    "status" "PlacementStatus" NOT NULL DEFAULT 'ACTIVE',
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
CREATE UNIQUE INDEX "Consultant_neonUserId_key" ON "Consultant"("neonUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_email_key" ON "Consultant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_displayId_key" ON "Client"("displayId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_consultantId_idx" ON "Client"("consultantId");

-- CreateIndex
CREATE UNIQUE INDEX "Stakeholder_displayId_key" ON "Stakeholder"("displayId");

-- CreateIndex
CREATE INDEX "Stakeholder_clientId_idx" ON "Stakeholder"("clientId");

-- CreateIndex
CREATE INDEX "StakeholderContactHistory_stakeholderId_idx" ON "StakeholderContactHistory"("stakeholderId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_clientId_idx" ON "ClientJobResearch"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_displayId_key" ON "Candidate"("displayId");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "CandidateScreeningHistory_candidateId_idx" ON "CandidateScreeningHistory"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOrder_displayId_key" ON "JobOrder"("displayId");

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
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderContactHistory" ADD CONSTRAINT "StakeholderContactHistory_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJobResearch" ADD CONSTRAINT "ClientJobResearch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateScreeningHistory" ADD CONSTRAINT "CandidateScreeningHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSubmission" ADD CONSTRAINT "CandidateSubmission_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSubmission" ADD CONSTRAINT "CandidateSubmission_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CandidateSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

