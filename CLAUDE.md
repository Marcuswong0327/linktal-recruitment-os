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

## Data Model

Schema of record: `apps/api/prisma/schema.prisma` (it carries its own
per-model comments). `docs/database-erd.md` explains the shape; this section is
the short version.

### The two hierarchies

Most scoping and filtering resolves through one of two trees, and both behave
identically — **a node covers itself plus every descendant**:

- **Geography** — `Location`, four rungs (`COUNTRY ▸ STATE ▸ CITY ▸ SUBURB`),
  bulk-loaded from GeoNames. Nothing is hand-typed; `location:create` is
  admin-only. Linktal's desk labels are *not* nodes: `Brisbane GC QLD` is two
  CITY grants, `East Malaysia` two STATE grants, `All Malaysia` one COUNTRY grant.
- **Taxonomy** — `Industry ▸ Specialization ▸ child Specialization`. Consultants
  grant coarse categories (`Food`); records tag specific leaves (`Food Bakery`).
  Admin + manager create only.

Entities carry either **one** most-specific node (`Candidate.locationId`,
`JobOrder.locationId`, `ClientJobResearch.locationId`) or **a set** at mixed
granularity (`Client.locations`, `Stakeholder.coverage`, `Consultant.locations`).

### Job Title vs. Role Type

| | Assigned by | Table |
|---|---|---|
| **Job Title** | the company ("Product Engineer") | `JobTitle` |
| **Role Type** | the Linktal consultant ("Software Engineer") | `JobRoleType` / `StakeholderRoleType` |

Two role-type catalogs because the vocabularies never overlap: `JobRoleType`
classifies jobs/people (Electrician, CNC Machinist) for
Candidate/JobOrder/ClientJobResearch; `StakeholderRoleType` classifies contacts
by function (HR, Finance, Procurement) for Stakeholder. A Candidate has no
JobTitle — `currentRole` is their employer's words.

### Tables

**RBAC & identity** — `Role`, `Permission`, `RolePermission`, `Consultant`
(the only identity table; carries `jobTitleId` for seniority, `salary`,
`costTo`, `reportsToId` for the org chart).

**Scope grants** — `ConsultantIndustry`, `ConsultantSpecialization`,
`ConsultantLocation`. Explicit join models, not implicit m2m, so each grant is
an individually audited create/delete.

**Catalogs** — `Location`, `Industry`, `Specialization` (scope-bearing,
restricted creation) · `JobTitle`, `JobRoleType`, `StakeholderRoleType`
(combobox-growable by anyone).

**Client side** — `Client`, `ClientLocation`, `Tob` (many per client;
`pricing` free text, `guaranteePeriod` numeric days), `Stakeholder`,
`StakeholderLocation`, `StakeholderContactHistory`, `ClientJobResearch`.

**Candidate side** — `Candidate`, `CandidateSpecialization`,
`CandidateContactHistory` (screening *and* outreach notes, separated by
`category`; salary fields are free text — the source records "35 per hour").

**Pipeline** — `JobOrder`, `CandidateSubmission`, `Interview`, `Placement`,
`AuditLog`.

### Required vs. optional

Almost everything is optional, because historical fill rates are low. The
exceptions exist only because the scope resolver can't work without them:
`Client.industryId`, `Candidate.industryId`, `Candidate.locationId`, and at
least one `ClientLocation`.

### JSONB fields

| Field | Shape |
|---|---|
| `Candidate.workHistory` | `[{company, role, period}]` — `period` is free text |
| `Candidate.notes` | `[{id, content, timestamp, by, editedAt, editedBy}]` |
| `Client.addresses` · `Client.suburbsAndPostcodes` | arrays of strings |

`Client` has no notes timeline — client-side notes live in
`StakeholderContactHistory`.

### displayId

Every entity has a sequence-generated `displayId` (`Client-####`, `CDD-####`,
`Stake-####`, `JO-####`, `TOB-####`, `CN-####`, `CDN-####`, `JR-####`,
`SUB-####`, `INT-####`, `PLC-####`, `consultant-####`). These double as the
**import identity** — the source workbook's ID columns are empty and its
cross-sheet links are name + row number, so the importer assigns `displayId`
from row position and re-imports match on it. Natural keys can't: 744 candidate
rows share an email, 568 share a mobile, 31 have neither.

### Status enums

- **Client**: COLD · WARM · TRADED
- **Candidate**: COLD · WARM · PLACED · UNS
- **JobOrder**: ACTIVE · PLACED · CLOSED · ON_HOLD
- **Submission**: SUBMITTED · INTERVIEWING · REJECTED · PLACED
- **Interview**: SCHEDULED · PENDING · PASSED · FAILED · CANCELLED
- **Placement**: ACTIVE · COMPLETED · FAILED · fee type PERCENTAGE | FLAT
- **Quality**: LOW · MEDIUM · HIGH
- **LocationLevel**: COUNTRY · STATE · CITY · SUBURB

Declaration order is sort order (Postgres enums sort by ordinal), so
`ORDER BY status`/`quality` is already meaningful without a CASE expression.

## Scoping

```
visible  =  (industry match AND specialization match)  OR  (location match)
```

`consultant` role only; admin/manager/finance/researcher are unrestricted.
Wildcards are materialised into concrete grant rows (never an "unrestricted"
flag), so zero rows means *not configured*, never *sees everything*.
**An assigned record is always visible to its owner**, regardless of grants —
every scope OR-s in `consultantId = me`, above the no-grants short-circuit.
Stakeholder is the exception, having no `consultantId`. Stakeholders instead
match on **their own coverage**, independent of where their client sits — and a
`Client` is reachable through such a stakeholder in turn, its fourth arm. So
`clientScope` is
`consultantId = me OR industry OR locations OR stakeholders.some(coverage)`.
Specialization narrows the industry arm and **is live** — an untagged record
passes on its industry alone. Clients are ~100% tagged and candidates ~5%, so it
cuts client lists hard and candidate lists barely.

**Assignment must agree with visibility**: a record can only be assigned to a
consultant the same `industry OR location` test would let see it (`400
CONSULTANT_SCOPE_MISMATCH`), and narrowing either grant releases whatever it
strands. Coverage grants visibility but not ownership — a client has no contacts
when it's created.

Worked examples + diagrams: `docs/scope-explained.md`. Spec: `docs/rbac-roles.md` §3.

## RBAC roles

| Role | Description |
|------|-------------|
| `admin` | Full access, incl. consultant/role management and the audit log |
| `manager` | Sees everything except the audit log; full CRUD on business data; onboards consultants but can't edit/deactivate them |
| `consultant` | Full workflow CRUD, scoped by the rule above |
| `finance` | Read placements/clients/job orders/TOBs; reports |
| `researcher` | Research + uploads; read-only on the workflow |
| `viewer` | Read-only |

## Recruitment workflow

```
1. Research      → ClientJobResearch (public job ads found online)
2. Win Client    → Client + Stakeholder (+ Tob)
3. Get Job Order → JobOrder (client briefs Linktal)
4. Source        → Candidate + CandidateContactHistory (find & screen)
5. Submit        → CandidateSubmission → Interview rounds
6. Place         → Placement
```

`ClientJobResearch` is deliberately separate from `JobOrder`: it's public market
information, not a brief Linktal has been given. A JobOrder may optionally link
back to the research row it originated from.

## Placement fees

```
Base Salary × (1 + Super%)  = Total Package
Total Package × Fee%        = Placement Fee    (feeType PERCENTAGE)
                            … or a flat feeValue (feeType FLAT)
```

`guaranteeEndDate` is **entered manually**. Guarantee terms live per-`Tob` and a
client can hold several that disagree, so deriving it would be guesswork.

Creating a Placement still auto-updates: candidate → PLACED, job order
`filledCount += 1` (→ PLACED when all openings are filled), and client → TRADED
on its first placement.

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
| `docs/database-erd.md` | ERD, the two hierarchies, table reference |
| `docs/scope-explained.md` | **Start here for scope.** Worked examples per consultant, diagrams, deletion scenarios, known gaps |
| `docs/workbook-import-discrepancies.md` | What the workbook importer can't resolve, and what needs deciding |
| `docs/migrations.md` | DB migration workflow: rollout, rollback, deploy |
| `docs/rbac-roles.md` | RBAC: permission matrix + the scoping rules (§3) |
| `docs/ux-patterns.md` | Reusable frontend UX patterns — currently: delete confirmation + undo-toast |

