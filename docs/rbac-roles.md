# RBAC — Roles, Permissions & Conditions

How authorization works in the Linktal API: the six roles, the permission matrix
they're seeded with, and the **conditional rules** enforced in code that the
permission table alone can't express.

> Source of truth: `apps/api/prisma/seed.ts` (the matrix) plus the service-level
> guards noted below. Re-run `pnpm --filter @linktal/api seed` after editing the
> matrix.

---

## 1. How a request is authorized

Auth is NextAuth (Auth.js) on the web app — **Microsoft Entra ID (Azure AD) SSO**
or **email + password** — which exchanges the sign-in for the API's own
short-lived **access JWT** (its `sub` is always the `Consultant` id, regardless
of sign-in method). Every API request then passes two guards:

1. **`AuthGuard`** — verifies the API access JWT and resolves the caller to a
   `Consultant`, attaching `{ roleName, permissions, isActive, … }` to the request.
   - Identity is matched by **`azureId`**, then by **`email`** on first login
     (which links a pre-created/imported consultant), else a new consultant is
     **just-in-time provisioned** as **`viewer`**. Provisioning and linking are
     recorded in the audit log.
   - **`isActive = false` → login is rejected** (`403 ACCOUNT_INACTIVE`), on
     *every* request (not just at token mint), so deactivating takes effect
     immediately. This is how access is revoked (see §5).
2. **`PermissionsGuard`** — if the route declares `@RequirePermission(resource, action)`,
   the caller must hold `resource:action` or gets **`403 FORBIDDEN`**. There is no
   implicit admin bypass — admins pass because the seed grants them everything.

Routes with no `@RequirePermission` (e.g. `/consultants/me`, `/health`, `/auth/*`)
only need authentication (or are `@Public()`).

---

## 2. Permission matrix

Actions: **C**reate · **R**ead · **U**pdate · **D**elete. `–` = no access.
(The `permission` and `audit` resources are read-only by design; `job_title`,
`job_role_type` and `stakeholder_role_type` are create+read only;
`consultant_industry`, `consultant_specialization` and `consultant_location`
are **read+update only** — see §4.)

`location`, `industry` and `specialization` are the three **scope-bearing**
catalogs: the scope resolver reads them, so a drifted or near-duplicate row
silently changes who can see what. Creation is therefore restricted — admin
only for `location` (it's bulk-loaded from GeoNames and shouldn't be typed at
all), admin+manager for `industry` and `specialization`. The remaining catalogs
(`job_title`, `job_role_type`, `stakeholder_role_type`) carry no scoping weight
and stay combobox-growable by anyone, because free creation there costs nothing
and speeds up data entry.

| Resource | admin | manager | consultant | finance | researcher | viewer |
|----------|:-----:|:-------:|:----------:|:-------:|:----------:|:------:|
| candidate     | CRUD | CRUD | CRUD | –  | CRU | R |
| client        | CRUD | CRUD | CRUD | R  | CRU | R |
| stakeholder   | CRUD | CRUD | CRUD | –  | CRU | R |
| job_order     | CRUD | CRUD | CRUD | R  | R   | R |
| job_research  | CRUD | CRUD | CRUD | –  | CRU | R |
| submission    | CRUD | CRUD | CRUD | –  | R   | R |
| placement     | CRUD | CRUD | CRUD | R  | R   | R |
| consultant    | CRUD | CR¹  | –    | –  | –   | – |
| tob           | CRUD | CRUD | CRUD | R  | –   | R |
| consultant_industry | RU | RU² | – | – | – | – |
| consultant_specialization | RU | RU² | – | – | – | – |
| consultant_location | RU | RU² | – | – | – | – |
| role          | CRUD | CRUD | –    | –  | –   | – |
| permission    | R    | R    | –    | –  | –   | – |
| location      | CRUD | R    | R    | R  | R   | R |
| industry      | CRUD | CRUD | R    | R  | R   | R |
| specialization| CRUD | CRUD | R    | R  | R   | R |
| job_title     | CR   | CR   | CR   | –  | CR  | – |
| job_role_type | CR   | CR   | CR   | –  | CR  | – |
| stakeholder_role_type | CR | CR | CR | – | CR | – |
| report        | CRUD | CR   | –    | CR | –   | – |
| **audit**     | R    | –    | –    | –  | –   | – |

¹ Managers **hold** `consultant:create/read/update/delete` in the seed, but a
service guard restricts the mutations — see §3. In practice managers can **read**
the directory (for the owner-picker) and **create** (onboard) a consultant, but
**cannot update or deactivate** one — that's admin-only.

² Unlike ¹, `consultant_industry:update` for managers is **not** additionally
restricted by the general "consultant management is admin-only" guard — it has
its own, separate escalation rule (self/peer-manager allowed, admin accounts
never) — see §3.

Plain-English summary:

| Role | Intent |
|------|--------|
| **admin** | Full system access, including consultant/role management and the audit log. |
| **manager** | Sees everything (except the audit log); full CRUD on business data; read + onboard consultants, but **no** editing/deactivating them; manages non-privileged roles. Constrained by §3. |
| **consultant** | Full workflow CRUD on recruitment entities, scoped by the rule in §3; read-only on the scope-bearing catalogs; no access to the consultant directory, roles, permissions, or their own scope assignment. |
| **finance** | Read placements/clients/job orders; create/read reports. |
| **researcher** | Create/read/update research + candidate/client/stakeholder uploads; read-only on the workflow. |
| **viewer** | Read-only across the recruitment entities. |

---

## 3. Conditional rules (enforced in code, not the matrix)

The permission table is resource-level; these rules depend on the *target's*
state or the *actor*, so they live in the services.

### Clients & Job Orders — no own-book restriction
`GET /clients` and `GET /job-orders` used to force
`where.consultantId = caller.consultantId` for the `consultant` role, on top of
the scope below. Because ownership is itself one of the scope's OR arms, that
`AND` swallowed every other arm: the effective rule collapsed to *assigned to
me*, and a consultant with no assigned accounts saw an **empty list** no matter
what they covered. It also disagreed with `findOne`, which never had the rule —
a client could be opened by URL yet never appear in its owner's own list.

Both now filter on the scope alone. `consultantId`/`consultantIds` from the
query string are honoured for every role, including `consultant`: the scope is
`AND`-ed on top, so filtering *by* someone else can only ever narrow what the
caller was already allowed to see, never widen it.

### Visibility scoping (`consultant` role only — every other role unrestricted)

> Worked examples, diagrams and the real per-consultant numbers live in
> [`scope-explained.md`](./scope-explained.md). This section is the spec.

A consultant's visible rows are:

```
visible  =  (industry match AND specialization match)  OR  (location match)
```

Two arms, **OR**-ed: a consultant reaches a record either because it's in their
industry, or because it's in their patch. `apps/api/src/common/scope.ts` holds
the shared helpers used by every service that scopes.

**Each arm is a hierarchy, and a grant covers the node plus every descendant.**

| Arm | Tree | Grants live in |
|---|---|---|
| Taxonomy | `Industry` ▸ `Specialization` ▸ child `Specialization` | `ConsultantIndustry`, `ConsultantSpecialization` |
| Geography | `Country` ▸ `State` ▸ `City` ▸ `Suburb` | `ConsultantLocation` |

So granting `Malaysia` covers every Malaysian state, city and suburb; granting
`Food` covers `Food Bakery`, `Food Meat` and every other child.

**Wildcard rule, applied per parent.** If a consultant lists specific children
under a parent they hold, the grant narrows to those children; if they list
none, the whole parent is granted. Two consequences worth spelling out:

- Country `Australia` + cities `[Sydney]` grants **CITY Sydney**, not all of
  Australia. Country `Australia` + cities `[]` grants **COUNTRY Australia**.
- The rule is per-parent, so a mixed assignment behaves sensibly: countries
  `[Malaysia, Australia]` with cities `[Klang Valley, East Malaysia]` grants
  those two Malaysian nodes **plus the whole of Australia**, since Australia had
  no cities listed against it.

A listed city must sit under a listed country; anything else is a validation
error rather than a silent grant.

Wildcards are **materialised into concrete grant rows** at assignment/import
time rather than stored as an "unrestricted" flag. Two reasons: every grant
stays visible and auditable, and zero rows unambiguously means *not configured*
rather than *sees everything*. The cost is that adding a new country later means
re-granting the consultants who were assigned "All".

**What's scoped, and how each entity resolves:**

| Entity | Industry arm | Location arm | Ownership arm |
|---|---|---|---|
| `Client` | own `industryId` / `specializationId` | own `ClientLocation` set, **or any live stakeholder's own coverage** | `consultantId` |
| `Candidate` | own `industryId` / `CandidateSpecialization` | own `locationId` | `consultantId` |
| `JobOrder` | via parent `Client` | own `locationId` | `consultantId` |
| `ClientJobResearch` | via parent `Client` | own `locationId` | `consultantId` |
| `Stakeholder` | via parent `Client` | **own `StakeholderLocation` coverage** | — (no `consultantId`) |

Stakeholders are the one asymmetry, and it's deliberate: a contact is matched on
the territory *they* cover, independent of where their employer sits. A Brisbane
client's national account manager whose coverage includes Sydney is reachable by
a Sydney-scoped consultant.

**Ownership overrides everything else**, on every entity that carries a
`consultantId` — Client, Candidate, JobOrder and ClientJobResearch. A record
assigned to a consultant is always theirs to see, whatever their grants say. An
assignment is a deliberate admin act on one specific row — not a wildcard — so
honouring it doesn't reopen the "zero grants means everything" hole the rest of
this section is careful about. Two consequences:

- It sits **above** the no-grants short-circuit: a consultant with no
  industry/location grants at all still sees what's been handed to them, rather
  than being locked out of their own work. Everything *outside* their
  assignments still resolves to nothing until they're configured.
- Retagging a record's industry no longer strips it from the owner's view. It
  still triggers the auto-clear below if the new industry doesn't match them —
  but until that clears the assignment, the record stays visible to whoever
  holds it. No one is left owning something they can't open.

`Stakeholder` is the one entity with no ownership arm, because it has no
`consultantId`: contacts belong to a client, not to a recruiter.

**Clients carry one further arm**, so `clientScope` is a four-way OR:

```
Client visible  =  consultantId = me                      <- assignment always wins
                OR industry match
                OR own ClientLocation match
                OR stakeholders.some(own coverage match)  <- Client only
```

The ownership arm widens the list on every entity that has it: an assigned
record shows up even when it's out of patch. It sits *above* the no-grants
short-circuit for the same reason — being handed an account and then getting a
403 on it is the failure this prevents.

That last Client arm is the counterpart to the stakeholder asymmetry: a company
is visible when one of its contacts covers the consultant's patch, even if the
company's own market doesn't.

Without it the two rules disagree and leave a dangling reference: the Brisbane
account manager above is reachable, but the company they work for 403s. That's a
broken link rather than a privacy boundary — you can already see the contact and
their contact history.

The arm excludes soft-deleted stakeholders explicitly (`deletedAt: null`): the
extended client's soft-delete rewrite intercepts top-level calls, not a nested
relation filter, so a removed contact would otherwise keep granting access to
their employer. The test is `some` — *is there **any** live contact covering my
patch* — so deleting one of several covering contacts changes nothing; access
lapses only when the last one goes (and even then, not for the owner).

Note this arm is **not** inherited by `JobOrder` or `ClientJobResearch`, which
reach their parent Client for the *industry* arm only — their location arm stays
their own `locationId`.

**Null handling differs by tier, on purpose:**

- `Client.industryId` and `Candidate.industryId` are **required**, so the
  industry tier never has to decide what an untagged row means. Likewise
  `Candidate.locationId` (country level at minimum) and at least one
  `ClientLocation`.
- Specialization is **optional**, and an unspecialised row matches any grant on
  its industry. Without that passthrough, the ~72% of candidates carrying no
  specialization would disappear the moment that arm is switched on.

**Specialization filtering is live, and it bites unevenly.** It narrows the
industry arm whenever the consultant holds any specialization grant — every
consultant in the seed holds 2–4. Consultant-side vocabulary is coarse (`Food`,
`Packaging`), record-side values are fine (`Food Bakery`), and the
`Specialization.parentId` tier reconciles them via `ancestorIds`.

How hard it bites is decided by tagging coverage, not by any deliberate setting:
**1,643 of 1,645 clients carry a specialization, but only 205 of 3,960
candidates do.** Untagged rows take the passthrough, so for a Manufacturing
consultant granted `Packaging`+`Food` the arm rejects **936 of 1,335 clients**
and **33 of 2,157 candidates**. Backfilling the missing candidate tags would
narrow candidate lists sharply with no code change — worth deciding
deliberately rather than discovering.

**List vs. single-record access.** `findAll` filters silently. A direct `findOne`/`update`/`remove` on an out-of-scope
record gets an explicit `403 OUT_OF_JOB_SCOPE` rather than a generic 404 — the
caller is told *why*.

**Assignment guard — assignment must agree with visibility.** A
Client/Candidate/Job Order can only be assigned to a consultant who would reach
it anyway: the same `industry OR location` test (`400
CONSULTANT_SCOPE_MISMATCH`). Only checked when `consultantId` is explicitly part
of the write — an industry- or location-only edit is never blocked by this (see
the next rule instead).

It was industry-*only* until then, which broke both ways. Too strict: a
consultant granted four cities plus an industry holding zero clients could be
assigned nothing at all. Too loose: a Sydney client could be handed to a
Melbourne-only consultant, who then couldn't see it. Stakeholder coverage —
`clientScope`'s fourth arm — is deliberately excluded, because a client has no
contacts at the moment it's created, so the guard would be unenforceable on
`create`. Coverage grants *visibility*, not *ownership*.

Locations are compared through `ancestorIds`, so a COUNTRY grant qualifies its
holder for a CITY-tagged record exactly as it does in the scopes above.

**Bidirectional auto-clear.** A stale uncovered `consultantId` can't persist.
Changing a Client/Candidate's `industryId` **or its location(s)** (without
touching `consultantId` in the same request) silently clears the existing
assignment if neither arm still reaches it, cascading to that Client's Job
Orders — each checked on its own location. Symmetrically, changing a
consultant's own industry *or* location grants re-checks everything assigned to
them and releases whatever no longer qualifies.

**Submission industry guard** (applies to *every* role, not just scoped
consultants): `POST /candidate-submissions` rejects a candidate/job-order pair
whose industries differ (`400 SUBMISSION_INDUSTRY_MISMATCH`) — a data-integrity
rule about whether the pairing makes sense at all, independent of who's creating
it. Since a Job Order's industry is only reachable via its Client, this is really
"does the candidate's industry match the job order's client's industry".

**Latency.** `industryIds`, `specializationIds` and `locationIds` are minted into
the access token at login/refresh, same as `roleName`/`permissions` — a
reassignment takes effect on the consultant's next refresh (≤15 min), not
instantly.

### Manager hierarchy (`reportsToId`)

Managers are **not** narrowed by the scoping above — they see everything, as
before. `Consultant.reportsToId` powers an org-chart and a "my team" view
(a consultant's full descendant set, resolved by recursive CTE), which is a
presentation feature, not a permission boundary.

### Consultant scope assignment (`/consultants/:id/{industries,specializations,locations}`)

Assigning scope to a consultant is **not** folded into the general
`PATCH /consultants/:id` (which is hardcoded admin-only regardless of permission
grants, see the next section) — these are dedicated endpoints with their own
escalation rule, so managers can use them:

- **Admin** can assign to anyone **except themselves** (`400 CANNOT_MODIFY_SELF`).
- **Manager** can assign to **themselves**, to **other managers**, or to
  **consultants** — but **never to an admin account** (`403 FORBIDDEN`). A
  deliberate carve-out from the general escalation guard elsewhere.
- Every id in the request must exist and be active (`400 INVALID_*` /
  `400 INACTIVE_*`). `location` is the exception on the second half: the
  geography tree is bulk-loaded from GeoNames and has no `isActive` column, so
  only existence is checked.
- Full-set-replace: one `PUT` replaces the whole assignment, not separate
  add/remove endpoints. Diffed down to the minimum add/remove set (an id already
  granted isn't churned) and written as individual join-row create/delete calls,
  never a nested write, so each change is actually audited. Removals run first.
  Duplicate ids in the request are collapsed.
- `GET /consultants` / `GET /consultants/:id` only include the grant fields when
  the caller holds the matching `:read` permission — omitted entirely otherwise
  (not just empty), same convention as every other permission-gated field here.
  The three permissions are independent, so a caller can see one arm and not
  another.
- **`/locations` takes already-materialised node ids**, at any level. Expanding a
  wildcard or a desk label into concrete nodes is the caller's job — `All
  Malaysia` arrives as one COUNTRY id, `Brisbane GC QLD` as two CITY ids. That's
  what keeps every grant individually auditable and zero rows unambiguous.
- **Industry and location both cascade; specialization doesn't.** Narrowing
  either grant arm runs the auto-clear above, since either can strand a record
  assigned to that consultant. The re-check reads *current* grants rather than
  acting on the removed ids — with two arms granting ownership, losing an
  industry no longer implies a record is stranded, because the location arm may
  still cover it. Specializations only ever narrow the industry arm and never
  grant on their own, so removing one strands nothing and triggers no cascade.

### Consultant field redaction on Clients & Job Orders (`consultant` role only)
`consultantId` is nulled out in the API response (not the raw DB value —
just what's returned) on `Client` and `JobOrder` reads for the `consultant`
role specifically, on top of the row scoping above — every other role sees
the real value. It matters more than it used to: with the own-book filter
gone, a consultant's list now includes records owned by other people, so it's
enforced server-side rather than left to a hidden frontend column, so a
crafted request against the raw API can't recover it either.
`apps/api/src/common/redact-consultant-field.ts` holds the shared helper.

### Consultants (`/consultants`, guarded by `consultant`)
Managing a consultant is **admin-only IAM**, even though managers hold the
`consultant` permissions:

- **Read** (`GET`) — admin + manager (powers the owner-picker on job orders /
  companies). This is the only consultant access managers actually use.
- **Create** (`POST`) — admin + manager, but a manager **cannot** assign the
  **admin or manager** role (privileged-role guard, `403`).
- **Update** (`PATCH /consultants/:id`) — **admin only** (`403` otherwise). Covers
  role, active status **and** details (name/email). A role may be given by
  `roleName` (resolved to `roleId` server-side) or `roleId`.
- **Deactivate** (`DELETE /consultants/:id`) — **admin only**. It sets
  `isActive = false` (a soft deactivation), never a hard delete — consultants own
  clients/job orders whose ownership history is preserved.
- **Self-lockout:** an admin cannot deactivate **their own** account or change
  their own role away from admin via these endpoints (`400 CANNOT_MODIFY_SELF`).
- **Last-admin protection:** no one can demote or deactivate the **final active
  admin** (`409`). At least one active admin always exists.
- **Not settable via the API:** `displayId` (DB sequence `CST-000###`) and
  `azureId` (set by auth on login-link).

> The web "Consultants" admin page and the Activity Log are gated to the **admin
> role** in the UI (not a permission), matching the admin-only server guards.

### Self-service (`/consultants/me`, any authenticated user)
- `GET /consultants/me` — your own profile.
- `PATCH /consultants/me` — edits **`fullName` only**. It can **never** change your
  own `roleId` or `isActive`; those go through the admin-guarded `/consultants/:id`.

### Roles (`/roles`, guarded by `role`)
Structural rules apply to everyone (incl. admins):
- **The `admin` role is immutable** — nobody can edit or delete it.
- **Built-in roles are undeletable** — the six seeded roles can't be deleted;
  only **custom** roles can. Built-ins can still be *edited* (except `admin`).
- **Delete needs an empty role** — a role with consultants assigned can't be
  deleted (`409`); reassign those people first.

On top of that:
- **admin** — create custom roles (any permissions); read all; update any role
  except `admin`; delete custom roles (subject to the empty-role rule).
- **manager** — create custom roles; read all; update/delete every role **except
  `admin` and `manager`** (custom-only for delete), with an **escalation guard:**
  may only grant permissions the manager *themselves hold*.

Role create/update/delete are **audited** (written explicitly, since RolesService
runs on the base client with batch transactions).

### Permissions (`/permissions`, guarded by `permission:read`)
- **Read-only catalog** — no create/update/delete; used to populate the role
  editor's picker. Visible to **admin/manager only**.

### Audit log (`/audit-logs`, guarded by `audit:read`)
- **Admin-only, read-only.** Powers the Activity Log — every create/update/
  delete/restore/deactivate on the audited entities, with actor + diff.

---

## 4. Read-only resources, and the retired `user` resource

- **`permission`** is the fixed catalog of `resource:action` pairs. You attach
  existing ones to roles; you never create them at runtime — hence `read` only.
- **`audit`** is the append-only activity log — `read` only, admin-only.
- **`location`** is the geography tree, bulk-loaded from GeoNames (countries,
  states, cities, and postal places for suburbs). **Admin-only to create** — it
  is deliberately *not* a combobox catalog. The scope resolver walks this tree,
  so a hand-typed near-duplicate node would silently change who can see what,
  and the desk labels the business actually uses (`Brisbane GC QLD`,
  `Klang Valley`, `East Malaysia`) are *groupings* of real nodes rather than
  nodes themselves.
- **`industry`** / **`specialization`** are the taxonomy tree — full CRUD for
  admin and manager, **read-only for everyone else**. Also scope-bearing: a
  consultant inventing a near-duplicate specialization instead of picking the
  existing child would move records outside their own desk. `Specialization`
  carries a `parentId`, so the catalog is two-tier (`Food` ▸ `Food Bakery`).
- **`job_title`** is what the *company* calls a role ("Product Engineer"),
  shared by Stakeholder, JobOrder, ClientJobResearch and Consultant (where it
  carries seniority — "Consultant (Senior)", "Support (Finance)").
- **`job_role_type`** / **`stakeholder_role_type`** are what the *consultant*
  classifies that role as. Two catalogs, not one, because the vocabularies never
  overlap: `job_role_type` covers jobs and people (Electrician, Fitter Lead, CNC
  Machinist) for Candidate/JobOrder/ClientJobResearch, while
  `stakeholder_role_type` covers contacts by function (HR, Finance, Safety,
  Procurement). Merging them would offer trades in the dropdown when tagging a
  CFO.
- These last three are the create+read-only **combobox catalogs**: the form
  field doubles as the catalog editor — picking an existing value is `read`,
  typing a new one is `create` (upsert-by-name, so a duplicate returns the
  existing row rather than erroring). None of them carries scoping weight, which
  is exactly why free creation is safe here and not on `location`/`industry`/
  `specialization`.

  Growing a catalog is its **own** call, though. `POST /stakeholders` and
  `POST /job-orders` take `jobTitleId`/`jobRoleTypeId` and never create a
  catalog row on the way past — the combobox calls `POST /job-titles` first and
  submits the id it gets back. That keeps `job_title:create` an actual
  permission check rather than something any writer inherits for free, and stops
  a typo in a job-order payload from silently seeding the catalog.

  Stakeholders are still auto-classified into `stakeholder_role_type` when the
  caller doesn't set one: the service reads the chosen `JobTitle`'s name and
  keyword-matches it, leaving the field independently editable to correct a bad
  guess. Job orders have no equivalent — the two role-type vocabularies don't
  overlap, so there's no classifier for the trades side.
- **`tob`** is Terms of Business — full CRUD for admin/manager/consultant, read
  for finance (they need the commercial terms), no access for researchers.
- There is **no `user` resource.** The app's identity table is **`Consultant`**;
  the admin "user management" screen was folded into **`/consultants`** and the
  old `user` permission was removed from the seed and pruned from the database.
- **`consultant_industry`** / **`consultant_specialization`** /
  **`consultant_location`** are a different shape again: **read+update only**,
  no create/delete actions — assigning a consultant's scope is a
  full-set-replace `PUT` per arm, not separate add/remove endpoints (see §3).
  Default grants are admin + manager only, same as `consultant` itself, but they
  are fully independent resources: a manager holding these is *not* subject to
  the general "consultant management is admin-only" service guard that blocks
  `PATCH /consultants/:id` for them.

---

## 5. Access lifecycle & revocation

| Goal | Do this | Not this |
|------|---------|----------|
| **Revoke someone's access** | Admin sets `isActive = false` (via `PATCH /consultants/:id` or the deactivate `DELETE`) — blocks login immediately | **Don't** try to hard-delete — deactivation is the model, and it keeps ownership history |
| **Pre-create a teammate** | Admin/manager `POST /consultants` with email + (non-privileged) role. It auto-links on their first login by email | — |
| **Change someone's role / status** | Admin `PATCH /consultants/:id` (subject to §3) | Not via `/me`; not by a manager |
| **Let users fix their own name** | `PATCH /consultants/me` | — |

---

## 6. Endpoint → required permission

| Endpoint | Permission | Effective access |
|----------|-----------|------------------|
| `GET/POST/PATCH/DELETE /candidates` | `candidate:*` | per matrix — industry-scoped for `consultant` (see §3) |
| `GET/POST/PATCH/DELETE /clients` | `client:*` | per matrix — industry/location-scoped for `consultant` (see §3) |
| `GET/POST/PATCH/DELETE /stakeholders` | `stakeholder:*` | per matrix — industry-scoped for `consultant`, via parent Client (see §3) |
| `POST /stakeholders/:id/contact-history` | `stakeholder:update` | admin, manager, consultant, researcher — `contactedById` is always the caller, never request-supplied |
| `POST /candidates/:id/contact-history` | `candidate:update` | admin, manager, consultant, researcher — `contactedById` is always the caller, never request-supplied |
| `GET/POST /stakeholder-role-types` | `stakeholder_role_type:read` / `:create` | admin, manager, consultant, researcher |
| `GET/POST /job-role-types` | `job_role_type:read` / `:create` | admin, manager, consultant, researcher |
| `GET/POST /job-titles` | `job_title:read` / `:create` | admin, manager, consultant, researcher |
| `GET /locations` | `location:read` | everyone |
| `POST/PATCH/DELETE /locations` | `location:*` | admin only — the tree is GeoNames-loaded, not hand-typed |
| `GET/POST/PATCH/DELETE /tobs` | `tob:*` | admin, manager, consultant; finance read-only |
| `GET/POST/PATCH/DELETE /job-research` | `job_research:*` | per matrix — scoped for `consultant` via parent Client (see §3) |
| `GET/POST/PATCH/DELETE /job-orders` | `job_order:*` | per matrix — industry (via parent Client) / location-scoped for `consultant`, `consultantId` redacted in the response for that role (see §3) |
| `GET /candidates/:id/pipeline-timeline` | `candidate:read` | scoped to a candidate the caller can already read, not `audit:read` |
| `GET /job-orders/:id/pipeline-timeline` | `job_order:read` | scoped to a job order the caller can already read, not `audit:read` |
| `GET/POST/PATCH/DELETE /candidate-submissions` | `submission:*` | per matrix — `POST` also rejects a candidate/job-order pair whose industries don't match, for every role (see §3's industry scoping) |
| `GET/POST/PATCH/DELETE /interviews` | `submission:read` / `:update` (create/update/delete all gated on `:update` — a round is a sub-resource of its submission, same pattern as contact-history above; there's no separate `interview` permission) | admin, manager, consultant (read-only: finance, researcher, viewer) |
| `GET/POST/PATCH/DELETE /placements` | `placement:*` | per matrix — `POST` auto-calculates the fee fields and updates the candidate / job order / client status; `guaranteeEndDate` is entered manually |
| `GET /consultants` | `consultant:read` | admin, manager |
| `POST /consultants` | `consultant:create` | admin, manager (no privileged roles for managers) |
| `PATCH/DELETE /consultants/:id` | `consultant:update` / `:delete` | **admin only** (service guard) |
| `PUT /consultants/:id/industries` | `consultant_industry:update` | admin (anyone but self), manager (self/other-manager/consultant, never admin) — see §3 |
| `PUT /consultants/:id/specializations` | `consultant_specialization:update` | same escalation rules as industries |
| `PUT /consultants/:id/locations` | `consultant_location:update` | same escalation rules as industries |
| `PUT /consultants/:id/specializations` | `consultant_specialization:update` | same rule as industries — see §3 |
| `PUT /consultants/:id/locations` | `consultant_location:update` | same rule as industries — see §3 |
| `GET /consultants/hierarchy` | `consultant:read` | admin, manager — org chart / "my team" (see §3) |
| `GET/PATCH /consultants/me` | — (auth only) | everyone |
| `GET/POST/PATCH/DELETE /roles` | `role:*` | admin, manager |
| `GET /permissions` | `permission:read` | admin, manager |
| `GET /industries` · `GET /specializations` | `industry:read` / `specialization:read` | everyone |
| `POST/PATCH/DELETE /industries` · `/specializations` | `industry:*` / `specialization:*` | admin + manager only — scope-bearing |
| `GET/POST /specializations` | `specialization:read` / `:create` | admin, manager, consultant, researcher |
| `GET /audit-logs` | `audit:read` | admin |
