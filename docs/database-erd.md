# Recruitment System Database ERD

> **Source of truth:** `apps/api/prisma/schema.prisma`. This document is kept in
> sync with that schema and the RBAC seed (`apps/api/prisma/seed.ts`). If they
> disagree, the schema wins — update this doc.
>
> **Draft status:** this revision reflects a schema-only redesign pass done
> directly against the Linktal source workbook (12-sheet Google Sheet export)
> — no migration has been run yet. `prisma.extensions.ts` and
> `audit.service.ts` have already been updated to match some of this (Tob
> added to `AUDITED_MODELS`/`SOFT_DELETE_MODELS` and `ENTITY_LABEL`; the
> `fullName` references for Candidate/Stakeholder fixed to their new field
> names), but a lot of downstream code has not: `seed.ts`'s RBAC resources
> still list `saved_search` and `candidate_role_type`/`stakeholder_role_type`
> (removed/merged into `JobTitle` below), and — much larger — the entire
> `stakeholder-role-types/` and `candidate-role-types/` API modules
> (controllers, services, DTOs, entities) plus the generated frontend API
> client and several web features still reflect the pre-redesign shape
> entirely. None of that has been touched as part of this pass.

## Entity Relationship Diagram

```mermaid
erDiagram
    %% ==================== RBAC DOMAIN ====================
    Role {
        string id PK
        string name "unique: admin|manager|consultant|finance|researcher|viewer"
        string description
    }

    Permission {
        string id PK
        string resource "candidate|client|stakeholder|job_order|job_research|submission|placement|consultant|role|permission|industry|specialization|job_title|tob|report|audit"
        string action "create|read|update|delete"
        string description
    }

    RolePermission {
        string id PK
        string roleId FK
        string permissionId FK
    }

    %% ==================== IDENTITY / CONSULTANT ====================
    %% There is no separate User table. Authentication is handled by NextAuth
    %% (Auth.js) + Microsoft Entra ID (Azure AD), external; Consultant is the
    %% local identity + role record, linked by azureId. A first-time login is
    %% provisioned just-in-time (viewer role).
    Consultant {
        string id PK
        string displayId "unique: consultant-XXXX"
        string azureId "unique, nullable - Azure AD object id (oid)"
        string email "unique"
        string fullName
        string costTo "nullable - P&L bucket, e.g. Group P&L"
        string reportsToId "nullable FK -> Consultant - manager, self-relation"
        string roleId "nullable FK -> Role - position/tier lives here, not a separate field"
        boolean isActive "default true"
        datetime createdAt
        datetime updatedAt
    }

    %% Many-to-many: which industries a consultant is scoped to (a consultant
    %% can carry several, unlike Client/Candidate's single industryId). No
    %% id/timestamps — pure join, same shape pattern as StakeholderLocation.
    ConsultantIndustry {
        string consultantId PK "also FK -> Consultant"
        string industryId PK "also FK -> Industry"
    }

    %% Many-to-many: which Location nodes a consultant is scoped to, at ANY
    %% level (country, city, or suburb) — fills in the Country/City half of
    %% the KeyNote diagram's "Country Focus, Industry Focus, City Focus"
    %% description; Industry scoping stays on ConsultantIndustry above.
    ConsultantLocation {
        string consultantId PK "also FK -> Consultant"
        string locationId PK "also FK -> Location"
    }

    %% ==================== SHARED REFERENCE TABLES ====================
    %% Used across Client/Candidate/Stakeholder/JobOrder/ClientJobResearch.
    %% A single hierarchical geography tree instead of separate Country/City/
    %% Suburb tables. Australia -> Sydney NSW -> Silverwater 2128 is a 3-node
    %% chain. Client/Candidate/JobOrder/ClientJobResearch each point at their
    %% single most-specific known node; Stakeholder coverage can reference a
    %% node at ANY level (so "covers all of Australia" is one row).
    Location {
        string id PK
        string name "Australia / Sydney NSW / Silverwater 2128"
        string level "COUNTRY|CITY|SUBURB"
        string postcode "nullable, only meaningful at SUBURB level"
        string parentId "nullable, self-relation FK -> Location"
    }

    %% Consolidated from what were two separate tables (CandidateRoleType,
    %% StakeholderRoleType), then renamed from RoleType — not a coarse
    %% category, the actual job title itself. Growable/combobox-editable
    %% exactly like Industry/Specialization: pick an existing title or type
    %% a new one, broad ("Electrician") or as specific as "R&D Lab
    %% Technician and compounder". This is why the separate free-text
    %% jobTitle fields on Stakeholder/ClientJobResearch/JobOrder are gone —
    %% this table is the single source of the title now.
    JobTitle {
        string id PK
        string name "unique - broad or specific, e.g. Electrician, Hiring Manager, R&D Lab Technician and compounder"
        boolean isActive "default true"
    }

    %% ==================== CLIENT DOMAIN ====================
    Industry {
        string id PK
        string name "unique"
        boolean isActive "default true"
    }

    %% Belongs to exactly one Industry — the sheet data confirms specific
    %% specializations (e.g. "Engineering Parts", "Packaging - Plastic") only
    %% ever appear under one industry (Manufacturing), rather than being a
    %% flat, industry-agnostic catalog. name is unique per-industry, not
    %% globally. Not referenced directly by Client/Candidate/Consultant —
    %% none of them tag a specific specialization; their tagged Industry
    %% already implies which specializations apply (browsable via
    %% Industry.specializations).
    Specialization {
        string id PK
        string name "unique per industryId, not globally"
        string industryId FK "required"
        boolean isActive "default true"
    }

    Client {
        string id PK
        string displayId "unique: Client-XXXX"
        string companyName
        string industryId FK "required"
        string locationId FK "required - where this client SEEKS candidates from (hiring market), not its own address"
        jsonb addresses "nullable, array of strings - client's own physical office address(es), distinct from locationId"
        jsonb suburbsAndPostcodes "nullable, array of strings - client's own office suburb/postcode(s)"
        string website "nullable"
        string seekJobMarketUrl "nullable - barely used in source data (2/1645 rows)"
        string linkedinJobMarketUrl "nullable"
        string generalDescription "nullable"
        enum status "COLD|WARM|TRADED, default COLD"
        enum quality "LOW|MEDIUM|HIGH, default MEDIUM"
        datetime lastContactedAt "nullable, denormalized - max(contactedAt) across this client's stakeholders"
        string lastContactedById "nullable, logical ref (no FK) - who made that most recent contact"
        string consultantId FK "nullable - owning consultant"
    }

    %% One-to-many per client (a client can carry several TOB records over
    %% time — a signed document, a supplier agreement, an email-confirmed
    %% arrangement, ...). Pricing/guarantee period/payment term now live
    %% per-record here, NOT as flat fields on Client, since two TOBs for the
    %% same client can disagree on terms (e.g. a renegotiated rate). Every
    %% field is required. Soft-deleted like the other core entities.
    Tob {
        string id PK
        string fileName
        string fileType "e.g. TOB Document, Email Communication"
        string clientId FK
        string sourceFileLink "e.g. SharePoint URL"
        string clientTobRepresentative
        string linktalRepresentativeId FK "-> Consultant"
        float pricing "fee percentage agreed in this TOB"
        int guaranteePeriod "days"
        string paymentTerm "e.g. 30 days from invoice"
        string invoiceContactName
        string invoiceContactEmail
    }

    Stakeholder {
        string id PK
        string displayId "unique: Stake-XXXX"
        string clientId FK
        string firstName "was fullName - sheet only ever has a first name"
        string jobTitleId FK "renamed from roleTypeId, required - the separate free-text jobTitle field is gone, JobTitle is the sole source"
        string linkedinUrl "nullable"
        string email "required"
        string mobile "nullable"
        datetime lastContactedAt "nullable, denormalized"
        string lastContactedById "nullable, logical ref (no FK)"
        boolean isAccurate "nullable - verification flag, no default"
        string inaccurateReason "nullable"
    }

    %% Many-to-many: a stakeholder can cover several Location nodes, at mixed
    %% granularity (e.g. one row for all of "Australia", another for one
    %% specific suburb elsewhere). Replaces the old free-text
    %% "locationsCoverage" field so it can actually be matched against a
    %% Candidate's single locationId (walk the candidate's location up its
    %% parent chain and check for a hit against this set).
    StakeholderLocation {
        string stakeholderId PK "also FK -> Stakeholder"
        string locationId PK "also FK -> Location"
    }

    StakeholderContactHistory {
        string id PK
        string stakeholderId FK
        string contactType "channel: call|email|meeting|linkedin"
        string category "Detailed Brief Notes | Outreach Campaign History - distinct from contactType"
        string contactedById FK "required - consultant who made this specific contact"
        string notes "required"
        datetime contactedAt "default now"
    }

    ClientJobResearch {
        string id PK
        string clientId FK
        string consultantId FK "required - who conducted this research, mostly a researcher-role consultant"
        string locationId FK "required - replaces City Advertised / Suburbs columns"
        string jobTitleId FK "renamed from roleTypeId, required - the separate free-text jobTitle field is gone"
        enum status "snapshot of Client.status at research time, not live"
        string seekUrl "required"
        string permanentUrl "nullable"
        datetime postedDate "required - when the ad was posted, distinct from researchedAt"
        string contactEmailFromAd "nullable"
        string salaryRange "nullable - free-text salary info copied from the ad itself"
        boolean isContacted "default false"
        datetime lastContactedAt "nullable"
        string lastContactedById "nullable, logical ref (no FK)"
        string notes "nullable"
    }

    %% ==================== CANDIDATE DOMAIN ====================
    Candidate {
        string id PK
        string displayId "unique: CDD-XXXX"
        string firstName "required"
        string lastName "required"
        string email "required"
        string mobile "required"
        string locationId FK "required - replaces free-text country/city"
        string industryId FK "required"
        string jobTitleId FK "renamed from roleTypeId, required - this candidate's own occupation"
        string currentRole "nullable - renamed from currentPosition; free text on purpose, distinct temporal fact (current employer's title) from jobTitleId"
        string currentCompany "nullable"
        string linkedinUrl "nullable"
        string seekTalentUrl "nullable"
        string rawResumeUrl "nullable - 'Raw Resume File', the original as-submitted resume"
        string editedResumeUrl "nullable - 'Linktal Edited File', replaces the old single resumeUrl"
        jsonb workHistory "array of {company, role, startDate, endDate} - consolidated, replaces the sheet's numbered Previous Company/Role/Period columns"
        enum status "COLD|WARM|HOT|PLACED, default COLD"
        jsonb notes "array of {id, content, timestamp, by, editedAt, editedBy}"
        string consultantId FK "nullable - owning consultant"
        datetime lastContactedAt "nullable, denormalized"
        string lastContactedById "nullable, logical ref (no FK)"
    }

    %% Mirrors StakeholderContactHistory's category/channel split. Formerly
    %% kept separate from a standalone CandidateScreeningHistory model, but
    %% the source sheet never had one — screening notes and outreach notes
    %% both live here, distinguished only by category, with the screening
    %% content itself in conversationSummary. CandidateScreeningHistory was
    %% removed as redundant.
    CandidateContactHistory {
        string id PK
        string candidateId FK
        string contactType "channel: call|email|meeting|linkedin"
        string category "Detailed Screening Notes | Outreach Campaign History"
        string contactedById FK "required"
        datetime contactedAt "default now"
        string outreachCampaignNotes "nullable - filled when category is Outreach"
        string conversationSummary "nullable - filled when category is Screening"
        enum status "CandidateStatus, default WARM - snapshot at time of contact"
        string suburb "nullable"
        float currentSalary "nullable - a single actual figure, not a range"
        float expectedSalaryMin "nullable - candidates state expectations as a range"
        float expectedSalaryMax "nullable"
    }

    %% ==================== JOB ORDER DOMAIN ====================
    JobOrder {
        string id PK
        string displayId "unique: JO-XXXX"
        string clientId FK
        string consultantId FK "required"
        string jobTitleId FK "required - resolves the earlier open question of adding a parallel roleTypeId; goes straight to JobTitle as the sole source instead"
        string locationId FK "required - city required at minimum, suburb-level optional"
        string jobResearchId FK "nullable, unique - optional link back to the ClientJobResearch this originated from"
        float estimatedValue "nullable - 'Value' on the sheet, a forecast at job-order stage, distinct from Placement.feeValue (the actual fee post-placement)"
        string notes "nullable - 'Briefing Notes', internal recruiter notes distinct from description/requirements"
        enum status "ACTIVE|PLACED|CLOSED|ON_HOLD, default ACTIVE"
        enum quality "LOW|MEDIUM|HIGH, default MEDIUM"
        int openings "default 1, required"
        boolean isReplacement "default false"
        boolean isCollaborated "default false"
    }

    %% ==================== SUBMISSION / INTERVIEW / PLACEMENT DOMAIN ====================
    CandidateSubmission {
        string id PK
        string candidateId FK
        string jobOrderId FK
        enum status "SUBMITTED|INTERVIEWING|REJECTED|PLACED, default SUBMITTED"
        datetime submittedAt
    }

    Interview {
        string id PK
        string submissionId FK
        string roundLabel "free text, e.g. '1st Interview', 'Final Interview'"
        datetime interviewDate
        enum outcome "SCHEDULED|PENDING|PASSED|FAILED|CANCELLED, default SCHEDULED"
    }

    %% Fee calc: baseSalary * (1 + superPercentage/100) = totalPackage;
    %% totalPackage * feePercentage/100 = feeValue (feeType PERCENTAGE), or a
    %% flat feeValue (feeType FLAT). guaranteeEndDate = startDate + <guarantee
    %% period> — that period used to come from Client.guaranteePeriod, which
    %% no longer exists; it now lives per-Tob, and which Tob applies to a
    %% given placement is still an open service-layer decision.
    Placement {
        string id PK
        string displayId "unique, nullable: PLC-XXXX"
        string submissionId FK "unique - one placement per submission"
        float baseSalary
        float superPercentage "default 12"
        float totalPackage "auto"
        enum feeType "PERCENTAGE|FLAT, default PERCENTAGE"
        float feeValue "auto (PERCENTAGE) or entered directly (FLAT)"
        datetime startDate
        datetime guaranteeEndDate "auto - see comment above"
        boolean accountsNotified "default false"
        enum status "ACTIVE|COMPLETED|FAILED, default ACTIVE"
    }

    %% ==================== AUDIT / HISTORY DOMAIN ====================
    AuditLog {
        string id PK
        string actorId "logical ref to Consultant.id, nullable = system/import"
        string action "CREATE|UPDATE|SOFT_DELETE|RESTORE|HARD_DELETE|DEACTIVATE"
        string entityType "e.g. Candidate, Client, CandidateSubmission"
        string entityId "logical ref, no FK"
        jsonb changes "nullable: {field: {from, to}} for updates; created row for creates"
        jsonb metadata "nullable: {requestId?, ip?, cascade?, source: 'app'}"
        datetime createdAt
    }

    %% ==================== RELATIONSHIPS ====================
    Role ||--o{ RolePermission : "has"
    Permission ||--o{ RolePermission : "granted via"
    Role ||--o{ Consultant : "assigned to"
    Consultant ||--o{ Consultant : "reportsTo (self-relation, nullable)"

    Consultant ||--o{ Client : "owns"
    Consultant ||--o{ JobOrder : "manages"
    Consultant ||--o{ Candidate : "owns"
    Consultant ||--o{ StakeholderContactHistory : "made"
    Consultant ||--o{ CandidateContactHistory : "made"
    Consultant ||--o{ ConsultantIndustry : "scoped to"
    Consultant ||--o{ ConsultantLocation : "scoped to"
    Consultant ||--o{ Tob : "represents (linktalRepresentative)"
    Consultant ||--o{ ClientJobResearch : "conducted"
    Industry ||--o{ ConsultantIndustry : "scopes"

    Location ||--o{ Location : "parent (self-relation tree)"
    Location ||--o{ Client : "locates"
    Location ||--o{ Candidate : "locates"
    Location ||--o{ JobOrder : "locates"
    Location ||--o{ ClientJobResearch : "locates"
    Location ||--o{ StakeholderLocation : "covered via"
    Location ||--o{ ConsultantLocation : "scopes"
    Stakeholder ||--o{ StakeholderLocation : "covers"

    JobTitle ||--o{ Candidate : "is the occupation of"
    JobTitle ||--o{ Stakeholder : "is the title of"
    JobTitle ||--o{ ClientJobResearch : "is the title of"
    JobTitle ||--o{ JobOrder : "is the title of"

    Industry ||--o{ Client : "categorizes"
    Industry ||--o{ Specialization : "has"
    Industry ||--o{ Candidate : "categorizes"

    Client ||--o{ Stakeholder : "has"
    Client ||--o{ Tob : "has"
    Stakeholder ||--o{ StakeholderContactHistory : "has"
    Client ||--o{ ClientJobResearch : "has"
    Client ||--o{ JobOrder : "opens"
    ClientJobResearch |o--o| JobOrder : "originates (optional, one-to-one)"

    Candidate ||--o{ CandidateContactHistory : "has"
    Candidate ||--o{ CandidateSubmission : "submitted via"
    JobOrder ||--o{ CandidateSubmission : "receives"
    CandidateSubmission ||--o{ Interview : "has rounds"
    CandidateSubmission ||--o| Placement : "results in"
```

## Tables Summary

### RBAC (roles attach to Consultant; no separate User table)

| Table | Description | ID |
|-------|-------------|----|
| **Role** | Named roles (admin, manager, consultant, finance, researcher, viewer) | cuid |
| **Permission** | `resource` + `action` pair | cuid, unique(resource, action) |
| **RolePermission** | Join: roles ↔ permissions | cuid, unique(roleId, permissionId) |
| **Consultant** | Local identity + role (linked to Azure AD via `azureId`); carries `costTo` (P&L bucket) and a self-referencing `reportsToId` hierarchy | cuid, displayId `consultant-XXXX` |
| **ConsultantIndustry** | Join: consultants ↔ industries they're scoped to (many-to-many) | composite PK(consultantId, industryId) |
| **ConsultantLocation** | Join: consultants ↔ Location nodes they're scoped to, at any level — country, city, or suburb (many-to-many) — **new** | composite PK(consultantId, locationId) |

### Shared Reference Tables

| Table | Description | ID |
|-------|-------------|----|
| **Location** | Hierarchical geography tree (COUNTRY → CITY → SUBURB, self-relation `parentId`). Replaces separate free-text country/city/suburb fields across Client, Candidate, JobOrder, and ClientJobResearch — each points at its single most-specific known node. `postcode` only set on SUBURB rows. | cuid |
| **JobTitle** | Renamed from `RoleType` — not a coarse category, the actual job title, broad or specific ("Electrician", or as specific as "R&D Lab Technician and compounder"). Growable via combobox like Industry/Specialization. Now the *sole* source of the title on every table below — the separate free-text `jobTitle` fields that used to sit alongside it on `Stakeholder`/`ClientJobResearch` are gone, and `JobOrder` goes straight to this instead of adding a parallel field. Shared by `Candidate`, `Stakeholder`, `ClientJobResearch`, and `JobOrder`. | cuid |

### Core Entities

| Table | Description | Display ID |
|-------|-------------|------------|
| **Client** | Client companies (employers). `industryId`/`locationId` are both required now (were optional); `locationId` is where the client *seeks candidates from* (its hiring market), not its own office address — that's now `addresses`/`suburbsAndPostcodes` (JSONB arrays, distinct concept). `specializationId` removed — same reasoning as Candidate's: the tagged `industryId` is treated as sufficient (specializations are browsable via `Industry.specializations`, not tagged per-record). `tobSigned`/`feePercentage`/`guaranteePeriod`/`notes` removed — the first three superseded by the `Tob` one-to-many relation, `notes` dropped outright (no equivalent left). Added `lastContactedById` alongside the existing `lastContactedAt`, plus sheet columns that existed but were never modeled — `seekJobMarketUrl`, `linkedinJobMarketUrl`, `generalDescription`, `addresses`, `suburbsAndPostcodes` (all optional; barely-to-never used in the source data). | `Client-XXXX` |
| **Industry** | Reference table for `Client.industryId`/`Candidate.industryId` — growable via combobox | — |
| **Specialization** | No longer referenced directly by anything — belongs to exactly one `Industry` (`industryId` required FK, `name` unique per-industry not globally) and exists purely as that industry's own browsable sub-catalog, since neither `Client` nor `Candidate` tags a specific specialization anymore. | — |
| **Tob** | Terms of Business — **new**, one-to-many per client (a client can have several TOB records over time: a signed document, a supplier agreement, an email confirmation, ...). Pricing/guarantee period/payment term live per-record, not flat on `Client`, since two TOBs for the same client can disagree on terms. Every field required; soft-deleted and audited exactly like the other core entities (`Client`, `Stakeholder`, etc.) — same `deletedAt`/`deletedById` columns, now also wired into `SOFT_DELETE_MODELS`/`AUDITED_MODELS`. | — |
| **Stakeholder** | Contacts at client companies. Rebuilt to match the sheet 1:1: `fullName` → `firstName`; added `linkedinUrl`, `lastContactedById`, `isAccurate`/`inaccurateReason`; removed `isDecisionMaker`/`notes` (not present in the sheet); `locationsCoverage` free-text replaced by the `StakeholderLocation` join; separate free-text `jobTitle` removed, `roleTypeId` renamed `jobTitleId` (now the sole source of the title). | `Stake-XXXX` |
| **StakeholderLocation** | Join: stakeholders ↔ Location nodes they cover, at any granularity (country, city, or suburb level) — **new**, replaces the free-text `locationsCoverage` field | composite PK(stakeholderId, locationId) |
| **StakeholderContactHistory** | Communications with stakeholders. All fields now required; added `category` (Detailed Brief Notes / Outreach Campaign History) distinct from the existing channel-based `contactType`. | — |
| **ClientJobResearch** | Job-opening research / prospecting. Rebuilt to match the sheet: added `locationId`, `jobTitleId` (renamed from `roleTypeId`, now sole source of the title — separate free-text `jobTitle` removed), `status` (renamed from `clientRelationshipStatus` — a snapshot of `Client.status` at research time, not live), `seekUrl` (required), `permanentUrl`, `postedDate`, `contactEmailFromAd`, `lastContactedAt`/`lastContactedById`, and `consultantId` (required — who conducted the research, mostly a researcher-role consultant but not schema-restricted to that role). Now optionally links forward to the `JobOrder` it originates. | — |
| **Candidate** | Job seekers. `fullName` removed — just `firstName`/`lastName`, both required (the sheet's data was one or the other, never both). `email`/`mobile`/`locationId`/`industryId`/`jobTitleId` all required. `workHistory` JSONB is the single consolidated source for all previous companies/roles/periods. `roleTypeId` renamed `jobTitleId`, now pointing at the shared `JobTitle`; `currentRole` (renamed from `currentPosition`) stays as its own free-text field — a distinct, temporal fact (title at their *current* employer) from `jobTitleId` (their own occupation). Removed `yearsExperience`, `salaryExpectation`, `skills`. Added `seekTalentUrl`; `resumeUrl` split into `rawResumeUrl` ("Raw Resume File") and `editedResumeUrl` ("Linktal Edited File"). | `CDD-XXXX` |
| **CandidateContactHistory** | Communications with candidates. Added `category` (mirrors Stakeholder's), `status` (snapshot, default WARM), `suburb`, and split note content into `outreachCampaignNotes`/`conversationSummary` (replacing a single generic `notes` field, matching the sheet's own two columns). Salary is now numeric: `currentSalary` (`Float`, a single figure) and `expectedSalaryMin`/`expectedSalaryMax` (`Float`, a real range — candidates state expectations as "80-90k", not one number). Absorbs what `CandidateScreeningHistory` used to cover — see Removed table below. | — |
| **JobOrder** | Open positions. `consultantId` and `locationId` now required (were optional); `city`/`suburb` free text replaced by `locationId`; added optional `jobResearchId` link back to `ClientJobResearch`. Removed `department` (unused). Added `estimatedValue` ("Value" on the sheet — a forecast at job-order stage, distinct from `Placement.feeValue`), `notes` ("Briefing Notes", distinct from `description`/`requirements`), and `jobTitleId` (required — resolves the earlier open question of a parallel role-type field by going straight to `JobTitle` instead of the old free-text-only `jobTitle`). | `JO-XXXX` |
| **CandidateSubmission** | Candidate → JobOrder submissions — unchanged | unique(candidateId, jobOrderId) |
| **Interview** | Interview rounds within a submission's Interviewing stage — unchanged | — |
| **Placement** | Successful placements (fee calc) — unchanged fields, but see the guarantee-period note below | `PLC-XXXX` |
| **AuditLog** | Append-only history of every write to an audited model — see [Audit & History Tracking](#audit--history-tracking) | — |

### Removed

| Table | Why |
|-------|-----|
| **CandidateRoleType** | Merged into the shared `RoleType` (later renamed `JobTitle`) — it and `StakeholderRoleType` turned out to describe the same concept (a person's functional position), just populated from two different sheets |
| **StakeholderRoleType** | Merged into `RoleType` (later renamed `JobTitle`), same reasoning |
| **CandidateSpecialization** | No longer needed — `Candidate.industryId` is treated as sufficient to infer specialization by proxy |
| **CandidateSavedSearch** | No longer needed |
| **CandidateScreeningHistory** | Redundant — the source sheet never had a separate screening table; screening notes and outreach notes both lived in one Contact History sheet, distinguished only by a category flag. `CandidateContactHistory.category`/`conversationSummary` now covers what this used to. |

### JSONB Fields

| Table | Field | Structure |
|-------|-------|-----------|
| **Candidate** | `workHistory` | `[{ company, role, startDate, endDate }]` — consolidated timeline covering all previous companies/roles/periods (replaces the sheet's separate numbered "Previous Company 1/2", "Previous Role 1/2"... columns) |
| **Candidate** | `notes` | `[{ id, content, timestamp, by, editedAt, editedBy }]` — internal note timeline, newest last |
| **Client** | `addresses` | `["string"]` — the client's own physical office address(es), distinct from `locationId` (hiring market) |
| **Client** | `suburbsAndPostcodes` | `["string"]` — the client's own office suburb/postcode(s), same distinction as `addresses` |
| **AuditLog** | `changes` | `{ field: { from, to } }` per changed field (updates); the full created row (creates) |
| **AuditLog** | `metadata` | `{ requestId?, ip?, cascade?, source: 'app' }` |

## Status Enums

| Enum | Values |
|------|--------|
| **ClientStatus** | `COLD` · `WARM` · `TRADED` |
| **ClientQuality** | `LOW` · `MEDIUM` (default) · `HIGH` — declared in this order so the native Postgres enum sorts ordinally, not alphabetically |
| **CandidateStatus** | `COLD` · `WARM` · `HOT` · `PLACED` — also reused on `CandidateContactHistory.status` (default `WARM`, a per-contact snapshot) |
| **JobOrderStatus** | `ACTIVE` · `PLACED` · `CLOSED` · `ON_HOLD` |
| **JobOrderQuality** | `LOW` · `MEDIUM` (default) · `HIGH` — same declared-order trick as `ClientQuality` |
| **SubmissionStatus** | `SUBMITTED` · `INTERVIEWING` · `REJECTED` · `PLACED` |
| **InterviewOutcome** | `SCHEDULED` (default) · `PENDING` · `PASSED` · `FAILED` · `CANCELLED` |
| **PlacementStatus** | `ACTIVE` · `COMPLETED` · `FAILED` |
| **PlacementFeeType** | `PERCENTAGE` (default) · `FLAT` |
| **LocationLevel** | `COUNTRY` · `CITY` · `SUBURB` — new, backs the `Location` hierarchy |
| **UserStatus** *(enum defined, not yet used by a model)* | `ACTIVE` · `INACTIVE` · `SUSPENDED` |

## RBAC

Roles and permissions are created by `apps/api/prisma/seed.ts`. Access is
**role + resource + action** (enforced by `@RequirePermission(resource, action)`
on controllers → `PermissionsGuard`) for most resources — a permission like
`candidate:read` grants read on every candidate, no row-level restriction.

> **Pending follow-up**: `seed.ts`'s resource list still references
> `saved_search` and `candidate_role_type`/`stakeholder_role_type`, all
> removed/merged above. It hasn't been updated as part of this schema-only
> pass — needs a follow-up once this is actually migrated (drop
> `saved_search` entirely; consolidate the two role-type resources into a
> shared `job_title` resource covering Candidate/Stakeholder/
> ClientJobResearch/JobOrder alike; add a `tob` resource).

**`client` and `job_order` add a service-level row-scoping rule** on top of
the permission check — a caller with the `consultant` role only ever
sees/queries their **own** book (`consultantId = caller`), enforced in
`ClientsService.findAll` / `JobOrdersService.findAll` regardless of what a
`consultantIds` query param asks for. Every other role
(`manager`/`finance`/`researcher`/`admin`) sees the full list — this is a
visibility scope, not a different permission grant.

**Industry-based row scoping (on top of the above, `consultant` role only)** —
each consultant can be assigned one or more industries (`ConsultantIndustry`).
For the `consultant` role specifically (every other role is unrestricted
regardless of their own industry assignment):
- `Client`/`Candidate` (`industryId` directly) and `Stakeholder`/`JobOrder`
  (indirectly, via their parent `Client`) are filtered to records whose
  industry is in the caller's assigned set — **strict, no null-passthrough**.
  List endpoints filter silently; a direct `findOne`/`update`/`remove` on an
  out-of-scope record gets an explicit `403 OUT_OF_JOB_SCOPE` instead.
- **Industry-first assignment guard**: a Client/Candidate/Job Order can only
  have a consultant assigned once it already has an industry tagged, and only
  to a consultant who holds that industry — `400 INDUSTRY_REQUIRED` /
  `400 CONSULTANT_INDUSTRY_MISMATCH`.
- **Bidirectional auto-clear**: a stale mismatched `consultantId` can't
  persist — changing a Client/Candidate's industry, or a consultant's
  assigned industries, silently clears any now-mismatched `consultantId`
  (cascading from a Client to its Job Orders too) rather than erroring.
- **Submission industry guard** (applies to *every* role, not just scoped
  consultants): `POST /candidate-submissions` rejects a candidate/job-order
  pair whose industries don't match (`400 SUBMISSION_INDUSTRY_MISMATCH`).
- Claims (`roleName`, `permissions`, `industryIds`) are minted into the
  access token at login/refresh — an industry reassignment takes effect on
  the consultant's next token refresh (≤15 min).

**Location-based row scoping (`ConsultantLocation`, new)** — a consultant can
also be assigned one or more `Location` nodes, at any level (a whole country,
a specific city, or down to a suburb), matching the source workbook's
"Relationship Workflow KeyNote" diagram description of a consultant's default
scope as **Country + Industry + City**, not Industry alone. The intended rule
mirrors industry scoping: a `consultant`-role caller only sees
Client/Candidate/JobOrder/Stakeholder records whose location falls under (or
matches) one of their assigned `Location` nodes — walking the record's
location up its parent chain against the consultant's assigned set, same
ancestor-walk logic `StakeholderLocation` matching uses. **Not yet wired into
the actual row-scoping service code** (`ClientsService.findAll` etc. only
implement the industry half today) — a follow-up once this schema is
migrated.

> **Open design question raised during this pass**: any feature that matches
> a `Candidate` against `Stakeholder` coverage (via `Location`/
> `StakeholderLocation`) must intersect with the consultant's own
> industry+location scope — a location-only match could otherwise surface a
> stakeholder belonging to a client outside the consultant's assigned
> industry/country, silently bypassing the scoping rule enforced everywhere
> else. Not yet implemented; flagged here for whoever builds that matching
> query.

### Resources & actions (seed)

- **Resources:** `candidate`, `client`, `stakeholder`, `job_order`,
  `job_research`, `submission`, `placement`, `consultant`,
  `consultant_industry`, `role`, `permission`, `industry`, `specialization`,
  `saved_search` *(pending removal — see note above)*, `stakeholder_role_type`
  / `candidate_role_type` *(pending consolidation into a shared `job_title`
  resource — see note above)*, `tob`, `report`, `audit`
- **Actions:** `create`, `read`, `update`, `delete` (`industry`,
  `specialization`, and the role-type resources are create+read only;
  `consultant_industry` is **read+update only** — see `rbac-roles.md` §4)

### Role → permission matrix (from seed)

| Role | Grants |
|------|--------|
| **admin** | All actions on all resources (including `consultant_industry`) |
| **manager** | `read` on all; `create`/`update` on candidate, client, stakeholder, job_order, job_research, submission, placement, consultant; `update` on consultant_industry; `create` on industry, specialization, role types; `create` on report |
| **consultant** | Full CRUD on candidate, client, stakeholder, job_order, job_research, submission, placement; `create`/`read` on industry, specialization, role types; **no** access to consultant or consultant_industry |
| **finance** | `read` on placement, client, job_order; `create`/`read` on report |
| **researcher** | `create`/`read`/`update` on client, stakeholder, job_research, candidate; `create`/`read` on industry, specialization, role types; `read` on job_order, submission, placement |
| **viewer** | `read` on candidate, client, stakeholder, job_order, job_research, submission, placement |

> New users are provisioned just-in-time on first login with the **viewer** role
> (`RbacService`). An imported consultant matched by email is backfilled with the
> **consultant** role.

## Key Relationships

1. **Role → Consultant** — one role per consultant (nullable). A consultant's
   organizational tier ("Consultant (Senior)", "Researcher (Intern)", ...)
   also lives here, not in a separate field — there is deliberately no
   `Consultant.position` column.
2. **Role ↔ Permission** (via RolePermission) — many-to-many.
3. **Consultant → Consultant** (`reportsToId`) — self-referencing manager
   hierarchy, nullable (root-level consultants have none).
4. **Consultant → Client / JobOrder / Candidate** — ownership (`consultantId`,
   nullable on Client/Candidate; **required** on JobOrder now).
5. **Client → Stakeholder → ContactHistory ← Consultant** — contacts and
   their communications; each `StakeholderContactHistory` row attributes to
   the consultant who made it (`contactedById`, now required).
6. **Client → Tob** — one-to-many. Terms of Business documents/agreements;
   pricing, guarantee period, and payment term are per-TOB, not on `Client`.
7. **Client → ClientJobResearch ← Consultant** — prospecting research,
   attributed to the consultant who conducted it (`consultantId`, required),
   now also optionally originating a **JobOrder** (`JobOrder.jobResearchId`).
8. **Client → JobOrder** — open positions.
9. **Candidate → CandidateSubmission ← JobOrder** — submissions (unique per
    candidate+job).
10. **CandidateSubmission → Placement** — one placement per successful
    submission.
11. **CandidateSubmission → Interview** — a submission can carry several
    interview rounds, tracked while in the `INTERVIEWING` stage.
12. **Candidate → ContactHistory ← Consultant** — mirrors #5 for candidates;
    also covers what a standalone screening-history table used to (see
    Removed table above).
13. **Industry → Client / Candidate** — reference-table categorization.
    `Specialization` is no longer tagged directly on either `Client` or
    `Candidate` — see #14.
14. **Industry → Specialization** — one-to-many; a specialization belongs to
    exactly one industry (`name` unique per-industry, not globally).
    `Specialization` has no other consumer — it exists purely as each
    industry's own browsable sub-catalog.
15. **JobTitle → Candidate / Stakeholder / ClientJobResearch / JobOrder** — one
    shared catalog (renamed from `RoleType`), consolidated from the two
    previously-separate role-type tables. Now the sole source of the title
    on all four — the separate free-text `jobTitle` fields that used to sit
    alongside it are gone.
16. **Consultant ↔ Industry** (via `ConsultantIndustry`) — many-to-many;
    which industries a consultant is scoped to.
17. **Location → Location** (self-relation) — the COUNTRY→CITY→SUBURB tree.
18. **Location → Client / Candidate / JobOrder / ClientJobResearch** — each
    points at its single most-specific known node.
19. **Stakeholder ↔ Location** (via `StakeholderLocation`) — many-to-many, at
    mixed granularity; replaces the old free-text coverage field.
20. **Consultant ↔ Location** (via `ConsultantLocation`, new) — many-to-many,
    at any granularity; which countries/cities/suburbs a consultant is
    scoped to, alongside their industry scope.

### Denormalized `lastContactedAt` / `lastContactedById`

`Client`, `Stakeholder`, and `Candidate` each carry `lastContactedAt` (and now
`lastContactedById`) mirroring the max `contactedAt` (and its author) of their
contact history, so the companies/stakeholders/candidates lists can
sort/filter by "last contacted" without a live cross-table aggregate on every
page load (Prisma's relation-aggregate `orderBy` only supports `_count`, not
`_max`, on to-many relations — a real column is the only way to make this a
cheap, indexed sort). `Client.lastContactedAt`/`lastContactedById`
specifically are the max across *all* of that client's stakeholders (a
company is never contacted directly).

These columns are kept in sync two ways:
- **Live**: `POST /stakeholders/:id/contact-history` and
  `POST /candidates/:id/contact-history` bump the relevant
  `lastContactedAt`/`lastContactedById` column(s) — but only if the new
  contact is newer than what's already stored. `contactedById` on both
  endpoints always comes from the caller's own session, never the request
  body.
- **Historical backfill**: as before, from imported
  `StakeholderContactHistory`/`CandidateContactHistory` rows — see
  `apps/api/data/README.md` for the import scripts.

## Audit & History Tracking

The system keeps a full history of changes, not just the latest value, via a
single generic mechanism rather than bespoke tracking per entity.

### How it works

`apps/api/src/prisma/prisma.extensions.ts` defines one Prisma Client
Extension that intercepts every write (`$allOperations`) for the models
listed in `AUDITED_MODELS` — `Client`, `Stakeholder`, `ClientJobResearch`,
`Candidate`, `JobOrder`, `CandidateSubmission`, `Placement`, `Interview`,
`Tob`, `Consultant`, `Role`, `Permission`, `ConsultantIndustry`. For each
write it inserts one `AuditLog` row recording:
who (`actorId`, from the request's `RequestContext`, `null` = system/import),
when (`createdAt`), which record (`entityType` + `entityId`), what changed
(`changes`: `{ field: { from, to } }` for updates, the full row for creates),
and the source (`metadata.source`). `AuditLog` itself is neither soft-deleted
nor audited — it's the bottom of the stack.

The same extension also rewrites soft-deletable models
(`SOFT_DELETE_MODELS` — the same list minus `Consultant`/`Role`/`Permission`,
which are hard-deleted but still audited): `delete`/`deleteMany` become an
update stamping `deletedAt`/`deletedById`, and reads filter out
`deletedAt != null` automatically. Restoring a soft-deleted row (setting
`deletedAt` back to `null`) logs a `RESTORE` action.

Because interception happens at the Prisma layer, every service that writes
to an audited model gets a history for free — no per-feature audit-writing
code, and no route can accidentally skip it.

### Reading the history

- **`GET /audit-logs`** (`audit:read`, admin-only) — paginated, filterable
  (`action`, `entityType`, `actorId`, `from`/`to`), sortable
  (`createdAt`/`action`/`entityType`). Powers the web "Activity Log" page.
  Each row is resolved to a human label (e.g. `Client-0042 · Acme Corp`) via
  `ENTITY_LABEL` in `audit.service.ts`.
- **`GET /candidates/:id/pipeline-timeline`** / **`GET /job-orders/:id/pipeline-timeline`**
  (gated by `candidate:read`/`job_order:read`, not `audit:read`) — a derived
  view, not a separate table. `AuditService.getPipelineTimeline` reads the
  `CandidateSubmission` rows in scope plus their `AuditLog` entries and
  reshapes them into typed events: `CREATE` → `SUBMITTED`, `UPDATE` with a
  `status` change → `STAGE_CHANGE`, `SOFT_DELETE` → `REMOVED`, `RESTORE` →
  `RESTORED`. Rendered as the "Pipeline history" card on both the Candidate
  and Job Order detail pages.

### Candidate notes

`Candidate.notes` is a JSONB timeline, not a plain string (see JSONB Fields
above) — each entry independently carries its own author, created-at, and
(if edited) editor + edited-at. Only the note's author or an admin may edit
or delete it. Because the whole array is replaced on every note write, the
audit extension's generic array/object diffing also captures note edits as
an ordinary `changes.notes` entry on the parent `Candidate`. **`Client` no
longer has an equivalent `notes` field** — removed alongside `tobSigned`.

### What isn't covered

- A free-text **"reason"** field on ordinary audited writes — deferred,
  `AuditLog.metadata` is open JSON if a specific flow needs it later.
- Explicitly flagging historical **Excel-imported** contact history as
  "imported" rather than merely unattributed.

## Excel Import

Historical data is loaded from the Excel workbooks in `apps/api/data/` by the
scripts in `apps/api/scripts/`. **Those scripts are the authoritative
Excel→schema column mapping** (kept here previously, but they drift — read the
code instead) — and will need updating for this schema pass: the `Location`
hierarchy needs seeding (see below) before Client/Candidate/JobOrder/
ClientJobResearch import can resolve a `locationId`, and `JobTitle` (renamed
from `RoleType`) replaces the two separate role-type imports, plus the
separate free-text job title columns that used to be imported alongside them.

| Script | Loads |
|--------|-------|
| `import:excel` | Candidates, Clients, Job Orders |
| `import:placements` | Submissions + Placements |
| `inspect:excel` | Prints sheet/column structure (no writes) |

**Seeding `Location`**: since the business only operates in Australia and
Malaysia, a global geocoding library is unnecessary overhead — seed from
country-specific sources instead:
- **Australia**: [`matthewproctor/australianpostcodes`](https://github.com/matthewproctor/australianpostcodes)
  — free, public-domain suburb+postcode+state data derived from Australia
  Post.
- **Malaysia**: a maintained postcode→city→state CSV/JSON dataset (several
  exist on GitHub, derived from Pos Malaysia data).
- Walk each source into `Location` rows (COUNTRY → CITY → SUBURB), using
  `@@unique([parentId, name])` to dedupe.

See `apps/api/data/README.md` for setup. Run `seed` (RBAC) before importing.
