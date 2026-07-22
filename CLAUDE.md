# Linktal Recruitment OS

## Project Overview

This is an **internal hiring/recruitment system** (spreadsheet-native recruitment OS) for a recruitment agency. The system helps recruiters manage:
- **Clients** (companies hiring)
- **Candidates** (job seekers)
- **Job Orders** (open positions)
- **Submissions & Placements** (matching candidates to jobs)

## Tech Stack

### Monorepo Structure (pnpm + Turborepo)

```
linktal-recruitment-os/
├── apps/
│   ├── api/          # NestJS backend (Port 3001)
│   │   ├── prisma/   # Prisma ORM + PostgreSQL (Neon)
│   │   └── src/
│   │       ├── candidates/   # Candidates module (scaffold)
│   │       ├── health/       # Health check endpoint
│   │       └── prisma/       # Prisma service
│   └── web/          # Next.js 15 frontend (Port 3000)
│       └── src/
│           ├── app/          # App router
│           ├── features/     # Feature modules
│           │   └── candidates/
│           └── lib/          # Shared utilities
├── docs/             # Documentation
│   └── database-erd.md  # Full ERD and table mappings
└── packages/         # (empty - for shared packages)
```

### Key Dependencies
- **Backend**: NestJS 11, Prisma 6, PostgreSQL (Neon)
- **Frontend**: Next.js 15, React 19, TanStack Query, React Hook Form, Zod, Tailwind CSS 4

## Data Model (from Excel Analysis)

The database schema was derived from these Excel files:
- `Job Orders Portfolio.xlsx`
- `Icarus Client Database.xlsx`
- `Icarus Candidate Database.xlsx`

### User & RBAC Tables (4 tables)

| Entity | Description |
|--------|-------------|
| **User** | System users (auth + profile) |
| **Role** | User roles (admin, manager, consultant, finance, viewer) |
| **Permission** | Granular permissions (resource + action) |
| **RolePermission** | Junction: roles ↔ permissions |

### Core Entities (12 tables)

| Entity | Description | ID Format |
|--------|-------------|-----------|
| **Consultant** | Recruiter profile (linked to User) | consultant-XXXX |
| **ConsultantIndustry** | Junction: consultants ↔ industries they're scoped to (many-to-many — see `docs/rbac-roles.md` §3) | auto |
| **Client** | Client companies (employers) | Client-XXXX |
| **Stakeholder** | Contacts at client companies | Stake-XXXX |
| **StakeholderContactHistory** | Communication with stakeholders | auto |
| **ClientJobResearch** | Job openings research (historical/prospecting) | auto |
| **Candidate** | Job seekers (workHistory as JSONB) | CDD-XXXX |
| **CandidateScreeningHistory** | Screening notes (notes as JSONB) | auto |
| **JobOrder** | Open positions (`city`/`suburb`, `quality`, `isReplacement`/`isCollaborated` flags; optional link to Research) | auto |
| **CandidateSubmission** | Submissions to jobs | auto |
| **Interview** | Interview rounds within a submission's Interviewing stage (`roundLabel`, date, outcome) | auto |
| **Placement** | Successful placements (fee calculation) | PLC-XXXX |

### Placement Fee Fields (Confirmed — ✅ implemented)

`apps/api/src/placements/placements.service.ts` — see
`docs/manual-vs-automated-workflows.md` Rule 6 for the full auto-update flow
this triggers (candidate/job order/client status).

| Field | Type | Description |
|-------|------|-------------|
| baseSalary | Decimal | Base salary offered |
| superPercentage | Decimal | Default 12% |
| totalPackage | Decimal | Auto: baseSalary × (1 + super%) |
| feePercentage | Decimal | e.g., 15% |
| feeValue | Decimal | Auto (feeType PERCENTAGE): totalPackage × feePercentage — or a directly-entered flat amount (feeType FLAT) |
| feeType | Enum | `PERCENTAGE` or `FLAT` |
| startDate | DateTime | Candidate's first day = Invoice date |
| guaranteeEndDate | DateTime | Auto: startDate + client's guaranteePeriod |
| accountsNotified | Boolean | Whether accounts/finance has been notified of this placement |

### JSONB Fields (Flexible Arrays)

| Field | Structure | Purpose |
|-------|-----------|---------|
| `workHistory` | `[{company, role, startDate, endDate}]` | Unlimited work experience entries |
| `specializations` | `["string"]` | Unlimited specialization tags |
| `notes` | `[{text, createdAt}]` | Unlimited screening notes |

### Key Relationships

```
Role (1) ──── (N) User (1) ──── (0..1) Consultant
Role (N) ──── RolePermission ──── (N) Permission

Client (1) ──── (N) Stakeholder ──── (N) ContactHistory
Client (1) ──── (N) ClientJobResearch
Client (1) ──── (N) JobOrder (N) ──── (1) Consultant
JobOrder (N) ──→ (0..1) ClientJobResearch (optional link)
Candidate (1) ──── (N) ScreeningHistory
Candidate (1) ──── (N) Submission (N) ──── (1) JobOrder
Submission (1) ──── (N) Interview
Submission (1) ──── (0..1) Placement
```

### RBAC Roles (Confirmed)

| Role | Description |
|------|-------------|
| `admin` | Full system access, manage users |
| `manager` | View all data, reports, manage team |
| `consultant` | Full workflow access (CRUD own data) |
| `finance` | View placements, fees, invoices |
| `researcher` | Research + upload only (limited workflow) |
| `viewer` | Read-only access (optional) |

**Researcher vs Consultant:**
| Researcher Can Do | Researcher Cannot Do |
|-------------------|----------------------|
| Search client/company info | Enter screening call notes |
| Find job titles & hiring info | Manage job order workflow |
| Upload company information | Access sensitive candidate data |
| Upload candidate profiles | Create placements |
| Upload resumes | Financial data |

### Status Enums

- **User**: Active | Inactive | Suspended
- **Client**: Cold | Warm | Traded
- **Client/JobOrder Quality**: Low | Medium | High
- **Candidate**: Cold | Warm | Hot | Placed
- **JobOrder**: Active | Placed | Closed | On Hold
- **Submission**: Submitted | Interviewing | Rejected | Placed
- **Interview Outcome**: Scheduled | Pending | Passed | Failed | Cancelled
- **Placement**: Active | Completed | Failed
- **Placement Fee Type**: Percentage | Flat

## Recruitment Workflow

```
1. Research      → ClientJobResearch (find job postings online)
2. Win Client    → Client + Stakeholder (sign TOB agreement)
3. Get Job Order → JobOrder (client requests candidates)
4. Source        → Candidate + ScreeningHistory (find & screen)
5. Submit        → CandidateSubmission (send resume to client)
6. Place         → Placement (successful hire)
```

## Status Auto-Update Flow

See `docs/manual-vs-automated-workflows.md` for full details and status per
trigger (most of Client/Stakeholder/Candidate status auto-updates are still
**pending**; the Placement-triggered updates below are **implemented**).

| Trigger | Should Update | Status |
|---------|---------------|--------|
| ContactHistory created | Stakeholder.status → Warm | ❌ pending |
| ScreeningHistory created | Candidate.status → Warm | ❌ pending |
| Placement created | Candidate.status → Placed | ✅ implemented |
| Placement created | JobOrder.filledCount += 1; status → Placed (if all openings filled) | ✅ implemented |
| Placement created | Client.status → Traded (if first placement) | ✅ implemented |
| Placement failed within guarantee | Alert consultant | ❌ pending |

## Guarantee Period Logic (Confirmed)

```
Default: 90 days (per Terms of Business)
Start: Candidate's actual start date (= Invoice Date = Placement Date)

Client.guaranteePeriod = 90 days (can vary per client)
Placement.startDate = Feb 1 (candidate's first day)
Placement.guaranteeEndDate = May 1 (auto-calculated: startDate + 90 days)
Placement.invoiceDate = Feb 1 (same as startDate)

If candidate quits before guaranteeEndDate:
  → Placement.status = Failed
  → Create replacement JobOrder (handled as new job, fee negotiated separately)
```

**Not tracked:** Offer date, contract signing date

## Confirmed Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | ClientJobResearch | Keep separate, optional link from JobOrder |
| 2 | Salary range | Include as optional fields (salaryMin, salaryMax) |
| 3 | Replacement linking | No complex linking for now (treat as new job) |
| 4 | Custom types | Yes, allow free text input (Industry, Position, etc.) |
| 5 | Fee structure | Percentage of total package (salary + super), allow manual override |
| 6 | RBAC roles | Admin, Manager, Consultant, Finance, Researcher, Viewer |
| 7 | Guarantee period | 90 days (per Terms of Business) |
| 8 | Guarantee start date | Candidate's actual start date (= Invoice Date) |

**Fee Calculation:**
```
Base Salary × (1 + Super%) = Total Package
Total Package × Fee% = Placement Fee + GST
```

## Additional Confirmed Decisions

| # | Question | Decision |
|---|----------|----------|
| 9 | Data cleanup | Import as-is, handle duplicates during import |
| 10 | Auth provider | NextAuth (Auth.js v5): Microsoft Entra ID (Azure AD, single-tenant) OAuth, plus email+password (bcrypt `passwordHash` on `Consultant`, open self-registration) via a Credentials provider. NestJS mints/verifies its own access+refresh JWTs for both. Neon is Postgres-only (no Neon Auth) |
| 11 | MVP scope | Excel Import + RBAC first |
| 12 | Auto-updates | Implement all 17 service-level auto-updates |

**Duplicate Found:** CDD-0104 appears twice (Tony Ju vs Tony John) - assign new ID during import.

## Data Quality Issues (From Excel)

| Issue | Details |
|-------|---------|
| Duplicate ID | CDD-0104 appears twice |
| Empty columns | Specializations, LinkedIn, Tenure all 0% filled |
| Low fill rates | Consultant column 44% filled |
| Inconsistent data | Some fields need cleanup before migration |

## Current State

The codebase is a **skeleton/foundation** with:
- Basic Prisma schema (only `Candidate` model exists)
- Scaffold candidates CRUD module
- Health check endpoint
- Basic React Query setup on frontend

## Next Steps

1. ~~Get client confirmation on open questions~~ ✓ (12 decisions confirmed)
2. ~~Update Prisma schema with confirmed fields~~ ✓
3. Run migrations: `cd apps/api && npx prisma migrate dev`
4. Seed RBAC (Roles + Permissions)
5. Create Excel import script
6. Import data from Excel files
7. Build out API modules for each entity
8. Create spreadsheet-like UI components

## Commands

```bash
# Development
pnpm dev              # Start all apps
pnpm build            # Build all apps
pnpm lint             # Lint all apps
pnpm typecheck        # Type check all apps

# API specific
cd apps/api
pnpm prisma:studio    # Open Prisma Studio
pnpm prisma:migrate   # Run migrations
```

## Documentation

| File | Description |
|------|-------------|
| `docs/database-erd.md` | Full Mermaid ERD diagram and column mappings |
| `docs/manual-vs-automated-workflows.md` | Manual vs automated workflows + auto-update rules — mostly roadmap, but includes a real walkthrough of the built Job Orders pipeline (candidates roster, drag-and-drop panel, interview rounds, placement creation) |
| `docs/migrations.md` | DB migration workflow: rollout, rollback, Railway deploy |
| `docs/rbac-roles.md` | RBAC: role/permission matrix + conditional rules (admin protection, last-admin, self-service) |
