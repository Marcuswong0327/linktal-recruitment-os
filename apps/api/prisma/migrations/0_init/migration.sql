-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- displayId sequences.
-- Created up front because the CREATE TABLE statements below reference them
-- in their column DEFAULTs. Ownership is attached at the end of this file,
-- once the tables they belong to actually exist, so that dropping a table
-- drops its sequence with it.

CREATE SEQUENCE "Consultant_displayId_seq" AS integer;
CREATE SEQUENCE "Client_displayId_seq" AS integer;
CREATE SEQUENCE "Tob_displayId_seq" AS integer;
CREATE SEQUENCE "Stakeholder_displayId_seq" AS integer;
CREATE SEQUENCE "StakeholderContactHistory_displayId_seq" AS integer;
CREATE SEQUENCE "ClientJobResearch_displayId_seq" AS integer;
CREATE SEQUENCE "Candidate_displayId_seq" AS integer;
CREATE SEQUENCE "CandidateContactHistory_displayId_seq" AS integer;
CREATE SEQUENCE "JobOrder_displayId_seq" AS integer;
CREATE SEQUENCE "CandidateSubmission_displayId_seq" AS integer;
CREATE SEQUENCE "Interview_displayId_seq" AS integer;
CREATE SEQUENCE "Placement_displayId_seq" AS integer;


-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('COLD', 'WARM', 'TRADED');

-- CreateEnum
CREATE TYPE "ClientQuality" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('COLD', 'WARM', 'PLACED', 'UNS');

-- CreateEnum
CREATE TYPE "JobOrderStatus" AS ENUM ('ACTIVE', 'PLACED', 'CLOSED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "JobOrderQuality" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'INTERVIEWING', 'REJECTED', 'PLACED');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlacementFeeType" AS ENUM ('PERCENTAGE', 'FLAT');

-- CreateEnum
CREATE TYPE "InterviewOutcome" AS ENUM ('SCHEDULED', 'PENDING', 'PASSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LocationLevel" AS ENUM ('COUNTRY', 'STATE', 'CITY', 'SUBURB');

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
    "displayId" TEXT NOT NULL DEFAULT ('consultant-'::text || lpad((nextval('"Consultant_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "azureId" TEXT,
    "passwordHash" TEXT,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "jobTitleId" TEXT,
    "salary" DOUBLE PRECISION,
    "costTo" TEXT,
    "reportsToId" TEXT,
    "roleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantIndustry" (
    "consultantId" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,

    CONSTRAINT "ConsultantIndustry_pkey" PRIMARY KEY ("consultantId","industryId")
);

-- CreateTable
CREATE TABLE "ConsultantSpecialization" (
    "consultantId" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,

    CONSTRAINT "ConsultantSpecialization_pkey" PRIMARY KEY ("consultantId","specializationId")
);

-- CreateTable
CREATE TABLE "ConsultantLocation" (
    "consultantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "ConsultantLocation_pkey" PRIMARY KEY ("consultantId","locationId")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "LocationLevel" NOT NULL,
    "postcode" TEXT,
    "geonameId" INTEGER,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRoleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRoleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderRoleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeholderRoleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('Client-'::text || lpad((nextval('"Client_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "companyName" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "specializationId" TEXT,
    "addresses" JSONB,
    "suburbsAndPostcodes" JSONB,
    "website" TEXT,
    "seekJobMarketUrl" TEXT,
    "linkedinJobMarketUrl" TEXT,
    "generalDescription" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'COLD',
    "quality" "ClientQuality" NOT NULL DEFAULT 'MEDIUM',
    "lastContactedAt" TIMESTAMP(3),
    "lastContactedById" TEXT,
    "consultantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientLocation" (
    "clientId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "ClientLocation_pkey" PRIMARY KEY ("clientId","locationId")
);

-- CreateTable
CREATE TABLE "Tob" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('TOB-'::text || lpad((nextval('"Tob_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "clientId" TEXT NOT NULL,
    "fileName" TEXT,
    "fileType" TEXT,
    "sourceFileLink" TEXT,
    "clientTobRepresentative" TEXT,
    "linktalRepresentativeId" TEXT,
    "pricing" TEXT,
    "guaranteePeriod" INTEGER,
    "paymentTerm" TEXT,
    "invoiceContactName" TEXT,
    "invoiceContactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Tob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stakeholder" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('Stake-'::text || lpad((nextval('"Stakeholder_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "clientId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "jobTitleId" TEXT,
    "stakeholderRoleTypeId" TEXT,
    "linkedinUrl" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "lastContactedById" TEXT,
    "isAccurate" BOOLEAN,
    "inaccurateReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderLocation" (
    "stakeholderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "StakeholderLocation_pkey" PRIMARY KEY ("stakeholderId","locationId")
);

-- CreateTable
CREATE TABLE "StakeholderContactHistory" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('CN-'::text || lpad((nextval('"StakeholderContactHistory_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "stakeholderId" TEXT NOT NULL,
    "contactType" TEXT,
    "category" TEXT,
    "contactedById" TEXT,
    "notes" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeholderContactHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientJobResearch" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('JR-'::text || lpad((nextval('"ClientJobResearch_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "clientId" TEXT NOT NULL,
    "consultantId" TEXT,
    "locationId" TEXT,
    "jobTitleId" TEXT,
    "jobRoleTypeId" TEXT,
    "status" "ClientStatus",
    "seekUrl" TEXT,
    "permanentUrl" TEXT,
    "postedDate" TIMESTAMP(3),
    "contactEmailFromAd" TEXT,
    "salaryRange" TEXT,
    "isContacted" BOOLEAN NOT NULL DEFAULT false,
    "researchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastContactedAt" TIMESTAMP(3),
    "lastContactedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "ClientJobResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('CDD-'::text || lpad((nextval('"Candidate_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "locationId" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "jobRoleTypeId" TEXT,
    "currentRole" TEXT,
    "currentCompany" TEXT,
    "linkedinUrl" TEXT,
    "seekTalentUrl" TEXT,
    "rawResumeUrl" TEXT,
    "editedResumeUrl" TEXT,
    "workHistory" JSONB,
    "status" "CandidateStatus" NOT NULL DEFAULT 'COLD',
    "notes" JSONB,
    "consultantId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "lastContactedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSpecialization" (
    "candidateId" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,

    CONSTRAINT "CandidateSpecialization_pkey" PRIMARY KEY ("candidateId","specializationId")
);

-- CreateTable
CREATE TABLE "CandidateContactHistory" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('CDN-'::text || lpad((nextval('"CandidateContactHistory_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "candidateId" TEXT NOT NULL,
    "contactType" TEXT,
    "category" TEXT,
    "contactedById" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outreachCampaignNotes" TEXT,
    "conversationSummary" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'WARM',
    "suburb" TEXT,
    "currentSalary" TEXT,
    "expectedSalary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateContactHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrder" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('JO-'::text || lpad((nextval('"JobOrder_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "clientId" TEXT NOT NULL,
    "consultantId" TEXT,
    "jobTitleId" TEXT,
    "jobRoleTypeId" TEXT,
    "locationId" TEXT,
    "jobResearchId" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT DEFAULT 'AUD',
    "estimatedValue" DOUBLE PRECISION,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "filledCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "requirements" TEXT,
    "notes" TEXT,
    "status" "JobOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "quality" "JobOrderQuality" NOT NULL DEFAULT 'MEDIUM',
    "priorityLevel" INTEGER DEFAULT 2,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "JobOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSubmission" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('SUB-'::text || lpad((nextval('"CandidateSubmission_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "candidateId" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "CandidateSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('INT-'::text || lpad((nextval('"Interview_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "submissionId" TEXT NOT NULL,
    "roundLabel" TEXT NOT NULL,
    "interviewDate" TIMESTAMP(3) NOT NULL,
    "outcome" "InterviewOutcome" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL DEFAULT ('PLC-'::text || lpad((nextval('"Placement_displayId_seq"'::regclass))::text, 4, '0'::text)),
    "submissionId" TEXT NOT NULL,
    "baseSalary" DOUBLE PRECISION,
    "superPercentage" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "totalPackage" DOUBLE PRECISION,
    "feeType" "PlacementFeeType" NOT NULL DEFAULT 'PERCENTAGE',
    "feePercentage" DOUBLE PRECISION,
    "feeValue" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "guaranteeEndDate" TIMESTAMP(3),
    "accountsNotified" BOOLEAN NOT NULL DEFAULT false,
    "status" "PlacementStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "Consultant_azureId_key" ON "Consultant"("azureId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_email_key" ON "Consultant"("email");

-- CreateIndex
CREATE INDEX "Consultant_reportsToId_idx" ON "Consultant"("reportsToId");

-- CreateIndex
CREATE INDEX "Consultant_jobTitleId_idx" ON "Consultant"("jobTitleId");

-- CreateIndex
CREATE INDEX "ConsultantIndustry_industryId_idx" ON "ConsultantIndustry"("industryId");

-- CreateIndex
CREATE INDEX "ConsultantSpecialization_specializationId_idx" ON "ConsultantSpecialization"("specializationId");

-- CreateIndex
CREATE INDEX "ConsultantLocation_locationId_idx" ON "ConsultantLocation"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_geonameId_key" ON "Location"("geonameId");

-- CreateIndex
CREATE INDEX "Location_level_idx" ON "Location"("level");

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");

-- CreateIndex
CREATE INDEX "Location_name_trgm_idx" ON "Location" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Location_parentId_name_key" ON "Location"("parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "JobTitle_name_key" ON "JobTitle"("name");

-- CreateIndex
CREATE UNIQUE INDEX "JobRoleType_name_key" ON "JobRoleType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderRoleType_name_key" ON "StakeholderRoleType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_name_key" ON "Industry"("name");

-- CreateIndex
CREATE INDEX "Specialization_industryId_idx" ON "Specialization"("industryId");

-- CreateIndex
CREATE INDEX "Specialization_parentId_idx" ON "Specialization"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Specialization_industryId_name_key" ON "Specialization"("industryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_displayId_key" ON "Client"("displayId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_consultantId_idx" ON "Client"("consultantId");

-- CreateIndex
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");

-- CreateIndex
CREATE INDEX "Client_industryId_idx" ON "Client"("industryId");

-- CreateIndex
CREATE INDEX "Client_specializationId_idx" ON "Client"("specializationId");

-- CreateIndex
CREATE INDEX "Client_lastContactedAt_idx" ON "Client"("lastContactedAt");

-- CreateIndex
CREATE INDEX "Client_quality_idx" ON "Client"("quality");

-- CreateIndex
CREATE INDEX "ClientLocation_locationId_idx" ON "ClientLocation"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tob_displayId_key" ON "Tob"("displayId");

-- CreateIndex
CREATE INDEX "Tob_clientId_idx" ON "Tob"("clientId");

-- CreateIndex
CREATE INDEX "Tob_linktalRepresentativeId_idx" ON "Tob"("linktalRepresentativeId");

-- CreateIndex
CREATE INDEX "Tob_deletedAt_idx" ON "Tob"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stakeholder_displayId_key" ON "Stakeholder"("displayId");

-- CreateIndex
CREATE INDEX "Stakeholder_clientId_idx" ON "Stakeholder"("clientId");

-- CreateIndex
CREATE INDEX "Stakeholder_deletedAt_idx" ON "Stakeholder"("deletedAt");

-- CreateIndex
CREATE INDEX "Stakeholder_jobTitleId_idx" ON "Stakeholder"("jobTitleId");

-- CreateIndex
CREATE INDEX "Stakeholder_stakeholderRoleTypeId_idx" ON "Stakeholder"("stakeholderRoleTypeId");

-- CreateIndex
CREATE INDEX "Stakeholder_lastContactedAt_idx" ON "Stakeholder"("lastContactedAt");

-- CreateIndex
CREATE INDEX "StakeholderLocation_locationId_idx" ON "StakeholderLocation"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderContactHistory_displayId_key" ON "StakeholderContactHistory"("displayId");

-- CreateIndex
CREATE INDEX "StakeholderContactHistory_stakeholderId_idx" ON "StakeholderContactHistory"("stakeholderId");

-- CreateIndex
CREATE INDEX "StakeholderContactHistory_contactedById_idx" ON "StakeholderContactHistory"("contactedById");

-- CreateIndex
CREATE UNIQUE INDEX "ClientJobResearch_displayId_key" ON "ClientJobResearch"("displayId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_clientId_idx" ON "ClientJobResearch"("clientId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_consultantId_idx" ON "ClientJobResearch"("consultantId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_jobTitleId_idx" ON "ClientJobResearch"("jobTitleId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_jobRoleTypeId_idx" ON "ClientJobResearch"("jobRoleTypeId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_locationId_idx" ON "ClientJobResearch"("locationId");

-- CreateIndex
CREATE INDEX "ClientJobResearch_deletedAt_idx" ON "ClientJobResearch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_displayId_key" ON "Candidate"("displayId");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_deletedAt_idx" ON "Candidate"("deletedAt");

-- CreateIndex
CREATE INDEX "Candidate_consultantId_idx" ON "Candidate"("consultantId");

-- CreateIndex
CREATE INDEX "Candidate_lastContactedAt_idx" ON "Candidate"("lastContactedAt");

-- CreateIndex
CREATE INDEX "Candidate_industryId_idx" ON "Candidate"("industryId");

-- CreateIndex
CREATE INDEX "Candidate_jobRoleTypeId_idx" ON "Candidate"("jobRoleTypeId");

-- CreateIndex
CREATE INDEX "Candidate_locationId_idx" ON "Candidate"("locationId");

-- CreateIndex
CREATE INDEX "Candidate_firstName_trgm_idx" ON "Candidate" USING GIN ("firstName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_lastName_trgm_idx" ON "Candidate" USING GIN ("lastName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_email_trgm_idx" ON "Candidate" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_currentRole_trgm_idx" ON "Candidate" USING GIN ("currentRole" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_currentCompany_trgm_idx" ON "Candidate" USING GIN ("currentCompany" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_mobile_trgm_idx" ON "Candidate" USING GIN ("mobile" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_displayId_trgm_idx" ON "Candidate" USING GIN ("displayId" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CandidateSpecialization_specializationId_idx" ON "CandidateSpecialization"("specializationId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateContactHistory_displayId_key" ON "CandidateContactHistory"("displayId");

-- CreateIndex
CREATE INDEX "CandidateContactHistory_candidateId_idx" ON "CandidateContactHistory"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateContactHistory_contactedById_idx" ON "CandidateContactHistory"("contactedById");

-- CreateIndex
CREATE UNIQUE INDEX "JobOrder_displayId_key" ON "JobOrder"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOrder_jobResearchId_key" ON "JobOrder"("jobResearchId");

-- CreateIndex
CREATE INDEX "JobOrder_clientId_idx" ON "JobOrder"("clientId");

-- CreateIndex
CREATE INDEX "JobOrder_consultantId_idx" ON "JobOrder"("consultantId");

-- CreateIndex
CREATE INDEX "JobOrder_status_idx" ON "JobOrder"("status");

-- CreateIndex
CREATE INDEX "JobOrder_quality_idx" ON "JobOrder"("quality");

-- CreateIndex
CREATE INDEX "JobOrder_deletedAt_idx" ON "JobOrder"("deletedAt");

-- CreateIndex
CREATE INDEX "JobOrder_locationId_idx" ON "JobOrder"("locationId");

-- CreateIndex
CREATE INDEX "JobOrder_jobTitleId_idx" ON "JobOrder"("jobTitleId");

-- CreateIndex
CREATE INDEX "JobOrder_jobRoleTypeId_idx" ON "JobOrder"("jobRoleTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSubmission_displayId_key" ON "CandidateSubmission"("displayId");

-- CreateIndex
CREATE INDEX "CandidateSubmission_candidateId_idx" ON "CandidateSubmission"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateSubmission_jobOrderId_idx" ON "CandidateSubmission"("jobOrderId");

-- CreateIndex
CREATE INDEX "CandidateSubmission_status_idx" ON "CandidateSubmission"("status");

-- CreateIndex
CREATE INDEX "CandidateSubmission_deletedAt_idx" ON "CandidateSubmission"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSubmission_candidateId_jobOrderId_key" ON "CandidateSubmission"("candidateId", "jobOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Interview_displayId_key" ON "Interview"("displayId");

-- CreateIndex
CREATE INDEX "Interview_submissionId_idx" ON "Interview"("submissionId");

-- CreateIndex
CREATE INDEX "Interview_interviewDate_idx" ON "Interview"("interviewDate");

-- CreateIndex
CREATE INDEX "Interview_deletedAt_idx" ON "Interview"("deletedAt");

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

-- CreateIndex
CREATE INDEX "Placement_deletedAt_idx" ON "Placement"("deletedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantIndustry" ADD CONSTRAINT "ConsultantIndustry_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantIndustry" ADD CONSTRAINT "ConsultantIndustry_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantSpecialization" ADD CONSTRAINT "ConsultantSpecialization_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantSpecialization" ADD CONSTRAINT "ConsultantSpecialization_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantLocation" ADD CONSTRAINT "ConsultantLocation_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantLocation" ADD CONSTRAINT "ConsultantLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialization" ADD CONSTRAINT "Specialization_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialization" ADD CONSTRAINT "Specialization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Specialization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientLocation" ADD CONSTRAINT "ClientLocation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientLocation" ADD CONSTRAINT "ClientLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tob" ADD CONSTRAINT "Tob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tob" ADD CONSTRAINT "Tob_linktalRepresentativeId_fkey" FOREIGN KEY ("linktalRepresentativeId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_stakeholderRoleTypeId_fkey" FOREIGN KEY ("stakeholderRoleTypeId") REFERENCES "StakeholderRoleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderLocation" ADD CONSTRAINT "StakeholderLocation_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderLocation" ADD CONSTRAINT "StakeholderLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderContactHistory" ADD CONSTRAINT "StakeholderContactHistory_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderContactHistory" ADD CONSTRAINT "StakeholderContactHistory_contactedById_fkey" FOREIGN KEY ("contactedById") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJobResearch" ADD CONSTRAINT "ClientJobResearch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJobResearch" ADD CONSTRAINT "ClientJobResearch_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJobResearch" ADD CONSTRAINT "ClientJobResearch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJobResearch" ADD CONSTRAINT "ClientJobResearch_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJobResearch" ADD CONSTRAINT "ClientJobResearch_jobRoleTypeId_fkey" FOREIGN KEY ("jobRoleTypeId") REFERENCES "JobRoleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_jobRoleTypeId_fkey" FOREIGN KEY ("jobRoleTypeId") REFERENCES "JobRoleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSpecialization" ADD CONSTRAINT "CandidateSpecialization_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSpecialization" ADD CONSTRAINT "CandidateSpecialization_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateContactHistory" ADD CONSTRAINT "CandidateContactHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateContactHistory" ADD CONSTRAINT "CandidateContactHistory_contactedById_fkey" FOREIGN KEY ("contactedById") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_jobRoleTypeId_fkey" FOREIGN KEY ("jobRoleTypeId") REFERENCES "JobRoleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_jobResearchId_fkey" FOREIGN KEY ("jobResearchId") REFERENCES "ClientJobResearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSubmission" ADD CONSTRAINT "CandidateSubmission_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSubmission" ADD CONSTRAINT "CandidateSubmission_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CandidateSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CandidateSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attach each displayId sequence to the column it feeds.
ALTER SEQUENCE "Consultant_displayId_seq" OWNED BY "Consultant"."displayId";
ALTER SEQUENCE "Client_displayId_seq" OWNED BY "Client"."displayId";
ALTER SEQUENCE "Tob_displayId_seq" OWNED BY "Tob"."displayId";
ALTER SEQUENCE "Stakeholder_displayId_seq" OWNED BY "Stakeholder"."displayId";
ALTER SEQUENCE "StakeholderContactHistory_displayId_seq" OWNED BY "StakeholderContactHistory"."displayId";
ALTER SEQUENCE "ClientJobResearch_displayId_seq" OWNED BY "ClientJobResearch"."displayId";
ALTER SEQUENCE "Candidate_displayId_seq" OWNED BY "Candidate"."displayId";
ALTER SEQUENCE "CandidateContactHistory_displayId_seq" OWNED BY "CandidateContactHistory"."displayId";
ALTER SEQUENCE "JobOrder_displayId_seq" OWNED BY "JobOrder"."displayId";
ALTER SEQUENCE "CandidateSubmission_displayId_seq" OWNED BY "CandidateSubmission"."displayId";
ALTER SEQUENCE "Interview_displayId_seq" OWNED BY "Interview"."displayId";
ALTER SEQUENCE "Placement_displayId_seq" OWNED BY "Placement"."displayId";
