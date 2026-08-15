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
| consultant    | CRUD | CR¹  | R³   | –  | R³  | – |
| tob           | CRUD | CRUD | CRUD | R  | –   | R |
| consultant_industry | RU | RU² | R³ | – | R³ | – |
| consultant_specialization | RU | RU² | R³ | – | R³ | – |
| consultant_location | RU | RU² | R³ | – | R³ | – |
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

³ Read-only, added so `consultant`/`researcher` can pick teammates by name
(and see their industry/location grants) when assigning a job order's
consultant list — see §3's "Job order consultant assignment". Write access to
all four stays admin/manager only, unchanged.

Plain-English summary:

| Role | Intent |
|------|--------|
| **admin** | Full system access, including consultant/role management and the audit log. |
| **manager** | Sees everything (except the audit log); full CRUD on business data; read + onboard consultants, but **no** editing/deactivating them; manages non-privileged roles. Constrained by §3. |
| **consultant** | Full workflow CRUD on recruitment entities, scoped by the rule in §3; read-only on the scope-bearing catalogs; read-only on the consultant directory and everyone's industry/location/specialization grants (to pick teammates for a job order — see §3); no access to roles, permissions, or write access to anyone's scope assignment. |
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
the scope below — back when both entities still carried a single-owner
`consultantId`. That `AND` swallowed every other arm: the effective rule
collapsed to *assigned to me*, and a consultant with no assigned accounts saw
an **empty list** no matter what they covered. It also disagreed with
`findOne`, which never had the rule — a client could be opened by URL yet
never appear in its owner's own list. Both now filter on the scope alone (see
"Visibility scoping" below) — `Client.consultantId` is gone entirely since,
and `JobOrder`'s `consultantIds` query filter now matches through the
`JobOrderConsultant` join instead of a scalar column.

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

**This is a pure list filter — there is no gate.** `findAll` is the only place
any of this applies. A direct `findOne`/`update`/`remove` never checks scope at
all; a scoped consultant can open any record by id or link regardless of
whether it matches their grants. There is also no `consultantId` ownership on
Client or Candidate to fall back on — an empty-grants consultant's industry/
location arms naturally match nothing (`{ in: [] }` / `{ hasSome: [] }` are
always false), no special-cased short-circuit required.

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

| Entity | Industry arm | Location arm | Job-order-membership arm |
|---|---|---|---|
| `Client` | own `industryId` / `specializationId` | own `ClientLocation` set | reachable via any live `JobOrder` (own or not) that this consultant is on |
| `Candidate` | own `industryId` / `CandidateSpecialization` | own `locationId` | reachable via a live submission to a `JobOrder` this consultant is on |
| `JobOrder` | via parent `Client` | own `locationId` | own `JobOrderConsultant` membership |
| `ClientJobResearch` | via parent `Client` | own `locationId` | — (not job-order-scoped) |
| `Stakeholder` | — (delegates entirely to its `Client`) | — (delegates entirely to its `Client`) | — (delegates entirely to its `Client`) |

**The job-order-membership arm is the one deliberate way to reach an
out-of-scope Client or Candidate.** Several consultants can work the same
`JobOrder` concurrently (`JobOrderConsultant`, a many-to-many join, replacing
the old single `consultantId` owner) — being on that list surfaces the job
order's own Client and the Candidates submitted to *that specific job order*,
industry/location match or not. It carries **no scope-mismatch guard**: adding
someone outside their usual patch is the entire point, not an exception to
guard against. See "Job order consultant assignment" below.

`ClientJobResearch.consultantId` ("who conducted this research") is descriptive
metadata only, not a scope arm — research isn't job-order work, so there's no
membership concept to borrow from.

`Stakeholder` has no scope fields and no ownership of its own — it's visible
exactly when its parent `Client` is, full stop (`stakeholderScope = { client:
clientScope(user) }`). `Tob` follows the identical pattern
(`tobScope = { client: clientScope(user) }`).

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
historically **1,643 of 1,645 clients carried a specialization, but only 205 of
3,960 candidates did.** Untagged rows take the passthrough. Backfilling the
missing candidate tags would narrow candidate lists sharply with no code
change — worth deciding deliberately rather than discovering.

**Submission industry guard** (applies to *every* role, not just scoped
consultants): `POST /candidate-submissions` rejects a candidate/job-order pair
whose industries differ (`400 SUBMISSION_INDUSTRY_MISMATCH`) — a data-integrity
rule about whether the pairing makes sense at all, independent of who's creating
it. Since a Job Order's industry is only reachable via its Client, this is really
"does the candidate's industry match the job order's client's industry".

**Latency.** `industryIds`, `specializationIds` and `locationIds` are minted into
the access token at login/refresh, same as `roleName`/`permissions` — a
reassignment takes effect on the consultant's next refresh (≤15 min), not
instantly. Job-order membership isn't token-minted (it's read live per
request), so adding/removing a consultant from a job order takes effect
immediately.

### Job order consultant assignment (`PUT /job-orders/:id/consultants`)

Full-set-replace, same shape and audit pattern as the consultant
scope-assignment endpoints below (`applyScopeDiff`-style: diffed to the minimum
add/remove set, each written as an individual top-level
`JobOrderConsultant` create/delete so the audit extension sees and diffs every
row). Body: `{ consultantIds: string[] }`.

- **No scope-mismatch guard** — unlike every other assignment path in the app,
  a consultant can be added here regardless of their industry/location grants.
  That's the feature: it's the sanctioned way to bring someone in to help on an
  out-of-scope account.
- **Gated by `job_order:update`** — the same permission (and roles:
  admin/manager/consultant/researcher) that already covers editing a job
  order's other fields, not a privileged sub-permission the way consultant
  scope assignment is.
- Requires the picker to actually resolve names, which is why `consultant:read`
  and the three `consultant_industry/specialization/location:read`
  permissions were widened to `consultant`/`researcher` (see §2, footnote 3) —
  without it, `GET /consultants` returned an empty roster for those roles and
  the frontend had no way to show anyone but the caller themselves.
- `consultantIds` can also be seeded on `POST /job-orders` at creation time
  (same field, nested `create` rather than a diffed replace — nothing to diff
  against on a brand-new row).
- No auto-clear in either direction: narrowing a consultant's own industry/
  location grants never touches their `JobOrderConsultant` rows, and editing a
  job order's client/location never re-checks its members either. Membership
  here is deliberately immune to grant/industry drift — that's what makes it a
  reliable escape hatch rather than something that can silently evaporate.

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

- **Admin** can assign to anyone, **including themselves** — unlike the
  role/status self-lockout below, a scope grant can't lock an admin out of
  anything (admin is unrestricted by scope regardless of grants), so there's
  nothing to guard against here.
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

### Consultants (`/consultants`, guarded by `consultant`)
Managing a consultant is **admin-only IAM**, even though managers hold the
`consultant` permissions:

- **Read** (`GET`) — admin, manager, consultant, researcher (powers the
  job-order consultant picker — see §3 — plus the admin/manager consultant
  directory). Write access below stays admin/manager-only, unchanged; read is
  the only consultant access non-admin/manager roles get.
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
  Write grants are admin + manager only, same as `consultant` itself; read is
  additionally held by `consultant`/`researcher` (§2 footnote 3), needed to
  show grant info in the job-order consultant picker. These are fully
  independent resources: a manager holding these is *not* subject to the
  general "consultant management is admin-only" service guard that blocks
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
| `GET/POST/PATCH/DELETE /job-orders` | `job_order:*` | per matrix — industry (via parent Client) / location / job-order-membership-scoped for `consultant` (see §3) |
| `PUT /job-orders/:id/consultants` | `job_order:update` | admin, manager, consultant, researcher — full-set-replace, no scope-mismatch guard (see §3) |
| `GET/POST /candidates/export`, `/clients/export`, `/stakeholders/export` | `candidate:read` / `client:read` / `stakeholder:read` | both verbs are read-only (`POST` carries a body of ids to export, not a create) — `GET` exports every row matching the current filters, `POST` exports an explicit selection; scope is re-applied server-side on both |
| `GET /candidates/:id/pipeline-timeline` | `candidate:read` | scoped to a candidate the caller can already read, not `audit:read` |
| `GET /job-orders/:id/pipeline-timeline` | `job_order:read` | scoped to a job order the caller can already read, not `audit:read` |
| `GET/POST/PATCH/DELETE /candidate-submissions` | `submission:*` | per matrix — `POST` also rejects a candidate/job-order pair whose industries don't match, for every role (see §3's industry scoping) |
| `GET/POST/PATCH/DELETE /interviews` | `submission:read` / `:update` (create/update/delete all gated on `:update` — a round is a sub-resource of its submission, same pattern as contact-history above; there's no separate `interview` permission) | admin, manager, consultant (read-only: finance, researcher, viewer) |
| `GET/POST/PATCH/DELETE /placements` | `placement:*` | per matrix — `POST` auto-calculates the fee fields and updates the candidate / job order / client status; `guaranteeEndDate` is entered manually |
| `GET /consultants` | `consultant:read` | admin, manager, consultant, researcher (see §2 footnote 3) |
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
