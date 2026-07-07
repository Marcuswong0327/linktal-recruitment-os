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

### Core Entities (10 tables)

| Entity | Description | ID Format |
|--------|-------------|-----------|
| **Consultant** | Recruiter profile (linked to User) | consultant-XXXX |
| **Client** | Client companies (employers) | Client-XXXX |
| **Stakeholder** | Contacts at client companies | Stake-XXXX |
| **StakeholderContactHistory** | Communication with stakeholders | auto |
| **ClientJobResearch** | Job openings research | auto |
| **Candidate** | Job seekers (workHistory as JSONB) | CDD-XXXX |
| **CandidateScreeningHistory** | Screening notes (notes as JSONB) | auto |
| **JobOrder** | Open positions | auto |
| **CandidateSubmission** | Submissions to jobs | auto |
| **Placement** | Successful placements | auto |

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
Candidate (1) ──── (N) ScreeningHistory
Candidate (1) ──── (N) Submission (N) ──── (1) JobOrder
Submission (1) ──── (0..1) Placement
```

### RBAC Roles

| Role | Description |
|------|-------------|
| `admin` | Full system access, manage users |
| `manager` | View all data, reports, manage team |
| `consultant` | CRUD own clients/candidates/jobs |
| `finance` | View placements, fees, invoices |
| `viewer` | Read-only access |

### Status Enums

- **User**: Active | Inactive | Suspended
- **Client**: Cold | Warm | Traded
- **Candidate**: Cold | Warm | Hot | Placed
- **JobOrder**: Active | Placed | Closed | On Hold
- **Submission**: Submitted | Interviewing | Rejected | Placed

## Recruitment Workflow

```
1. Research      → ClientJobResearch (find job postings online)
2. Win Client    → Client + Stakeholder (sign TOB agreement)
3. Get Job Order → JobOrder (client requests candidates)
4. Source        → Candidate + ScreeningHistory (find & screen)
5. Submit        → CandidateSubmission (send resume to client)
6. Place         → Placement (successful hire)
```

## Status Auto-Update Flow (To Be Confirmed)

| Trigger | Should Update |
|---------|---------------|
| ContactHistory created | Stakeholder.status → Warm |
| ScreeningHistory created | Candidate.status → Warm |
| Placement created | Candidate.status → Placed |
| Placement created | JobOrder.status → Placed (if all openings filled) |
| Placement created | Client.status → Traded (if first placement) |
| Placement failed within guarantee | Alert + link to replacement JobOrder |

## Guarantee Period Logic

```
Client.guaranteePeriod = 90 days
Placement.startDate = Feb 1
Placement.guaranteeEndDate = May 1 (auto-calculated)

If candidate quits before guaranteeEndDate:
  → Placement.status = Failed
  → Create replacement JobOrder (fee = $0)
  → Link replacement to failed Placement
```

## Open Questions (Pending Client Confirmation)

1. **ClientJobResearch** - Merge into JobOrder (with status: Prospect → Active) or keep separate?
2. **Salary range** - Add salaryMin/salaryMax to JobOrder?
3. **Replacement linking** - Link replacement JobOrder to failed Placement?
4. **Custom types** - Allow consultants to add new Industry, Position types?
5. **Manual work awareness** - Phase 1 is manual, Phase 2 adds automation?
6. **Fee structure** - Flat rate, percentage, or both? Store on Client or JobOrder?
7. **Data cleanup** - Clean Excel before migration or import as-is?
8. **RBAC roles** - Confirm: Admin, Manager, Consultant, Finance, Viewer?
9. **Guarantee period** - Starts from placement date or start date?
10. **Resume submission** - System sends email or opens email client?
11. **Auth provider** - Custom build or third-party (Clerk/Auth0)?
12. **MVP scope** - Which modules first?
13. **Status auto-updates** - Auto-update statuses when actions happen, or keep manual?

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

1. Get client confirmation on open questions
2. Expand Prisma schema based on `docs/database-erd.md`
3. Create migrations for all entities
4. Build out API modules for each entity
5. Create spreadsheet-like UI components

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

## ERD Visualization

See `docs/database-erd.md` for the full Mermaid ERD diagram and column mappings from Excel to database fields.
