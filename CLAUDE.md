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

- **Geography** — `Location`, two rungs (`COUNTRY ▸ CITY_COVERAGE`), called
  "City Coverage" everywhere in the UI. 13 seeded rows (2 countries, 11 city
  coverages — e.g. `Brisbane GC QLD`, `KL Selangor`) are the approved catalog
  and `isProtected`: nobody, including admin, can rename or delete them.
  Admin can add further countries/city coverages beyond the 13, and can
  edit/delete the ones they added (`location:create`/`update`/`delete` are
  admin-only). A record or grant may sit on a country, a city coverage under
  it, or both at once (a client can be tagged `Australia` + `Sydney NSW`).
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
| `Client.addresses` | array of strings |

`Client` has no notes timeline — client-side notes live in
`StakeholderContactHistory`.

### displayId

Every entity has a sequence-generated `displayId` (`CLI-000###`, `CDD-000###`,
`STK-000###`, `JO-000###`, `TOB-000###`, `CN-000###`, `CDN-000###`, `JR-000###`,
`SUB-000###`, `INT-000###`, `PLC-000###`, `CST-000###`) — 6 digits,
non-truncating past that (`display_id()`, see `docs/database-erd.md`). These
double as the **import identity** for the 7 workbook-imported tables — the
source workbook's ID columns are empty and its cross-sheet links are name + row
number, so each importer assigns `displayId` from a per-tab ordinal counter
(sheet order, advanced only on a row that imports) and re-imports match on it.
Natural keys can't: 744 candidate rows share an email, 568 share a mobile, 31
have neither. Any bulk/raw load must be followed by `pnpm --filter @linktal/api
resync:display-ids`, or the next app-created row on an affected table collides
with an already-imported one.

### Status enums

- **Client**: COLD · WARM · TRADED
- **Candidate**: COLD · WARM · PLACED · UNS
- **JobOrder**: ACTIVE · PLACED · CLOSED · ON_HOLD
- **Submission**: SUBMITTED · INTERVIEWING · REJECTED · PLACED
- **Interview**: SCHEDULED · PENDING · PASSED · FAILED · CANCELLED
- **Placement**: ACTIVE · COMPLETED · FAILED · fee type PERCENTAGE | FLAT
- **Quality**: LOW · MEDIUM · HIGH
- **LocationLevel**: COUNTRY · CITY_COVERAGE

Declaration order is sort order (Postgres enums sort by ordinal), so
`ORDER BY status`/`quality` is already meaningful without a CASE expression.

## Scoping

```
visible  =  (industry match AND specialization match)  OR  (location match)
```

`consultant` role only; admin/manager/finance/researcher are unrestricted.
Wildcards are materialised into concrete grant rows (never an "unrestricted"
flag), so zero rows means *not configured*, never *sees everything*.

**This is a pure list filter, never a gate.** There is no `consultantId`
ownership on Client or Candidate anymore, and no 403 on a direct
`findOne`/`update` when scope doesn't match — scope only ever narrows
`findMany`. Manually assigning a consultant to "own" a client or candidate no
longer exists as a concept.

**The one deliberate way to reach an out-of-scope Client/Candidate**: get
added to a `JobOrder`'s consultant list (`JobOrderConsultant`, a many-to-many —
several consultants can work the same job order concurrently). That's a third
OR-arm on `clientScope` (via the job order's client) and `candidateScope` (via
a submission to that job order), and it carries **no scope-mismatch guard** —
adding someone outside their industry/location on purpose is the entire point.
`PUT /job-orders/:id/consultants` is the full-set-replace endpoint for it.
`jobOrderScope` itself gets the same membership arm directly.

Specialization narrows the industry arm and **is live** — an untagged record
passes on its industry alone. Clients are ~100% tagged and candidates ~5%, so it
cuts client lists hard and candidate lists barely.

Stakeholder and Tob have no scope fields of their own — both delegate entirely
to `clientScope` (`{ client: clientScope(user) }`), so a stakeholder or TOB is
visible exactly when its client is. `ClientJobResearch.consultantId` ("who
conducted this research") is descriptive metadata only, not a scope arm.

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
| `docs/ux-patterns.md` | Reusable frontend UX patterns: delete confirmation + undo-toast; confirm-before-commit |

