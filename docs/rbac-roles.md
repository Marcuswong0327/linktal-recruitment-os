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
(The `permission` and `audit` resources are read-only by design; `industry`,
`specialization`, `stakeholder_role_type`, and `candidate_role_type` are
create+read only; `saved_search` is create+read+delete only — see §4.)

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
| role          | CRUD | CRUD | –    | –  | –   | – |
| permission    | R    | R    | –    | –  | –   | – |
| industry      | CR   | CR   | CR   | –  | CR  | – |
| specialization| CR   | CR   | CR   | –  | CR  | – |
| stakeholder_role_type | CR | CR | CR | – | CR | – |
| candidate_role_type | CR | CR | CR | – | CR | – |
| saved_search  | CRD  | CRD  | CRD  | –  | CRD | – |
| report        | CRUD | CR   | –    | CR | –   | – |
| **audit**     | R    | –    | –    | –  | –   | – |

¹ Managers **hold** `consultant:create/read/update/delete` in the seed, but a
service guard restricts the mutations — see §3. In practice managers can **read**
the directory (for the owner-picker) and **create** (onboard) a consultant, but
**cannot update or deactivate** one — that's admin-only.

Plain-English summary:

| Role | Intent |
|------|--------|
| **admin** | Full system access, including consultant/role management and the audit log. |
| **manager** | Sees everything (except the audit log); full CRUD on business data; read + onboard consultants, but **no** editing/deactivating them; manages non-privileged roles. Constrained by §3. |
| **consultant** | Full workflow CRUD on recruitment entities; no access to the consultant directory, roles, or permissions. |
| **finance** | Read placements/clients/job orders; create/read reports. |
| **researcher** | Create/read/update research + candidate/client/stakeholder uploads; read-only on the workflow. |
| **viewer** | Read-only across the recruitment entities. |

---

## 3. Conditional rules (enforced in code, not the matrix)

The permission table is resource-level; these rules depend on the *target's*
state or the *actor*, so they live in the services.

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
- **Not settable via the API:** `displayId` (DB sequence `consultant-####`) and
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
- **`industry`** / **`specialization`** are reference tables for the company
  form's Industry/Specialization fields — no admin management page, no
  update/delete endpoints. The combobox on the company form doubles as the
  catalog editor: picking an existing value is `read`, typing a new one and
  hitting "Add" is `create` (upsert-by-name, so a duplicate just returns the
  existing row instead of erroring).
- **`stakeholder_role_type`** is the same pattern as `industry`/
  `specialization`, for the Stakeholder Enrichment Workspace's Role Type
  field — seeded with a starting set (Director, Hiring Manager, HR, Talent
  Acquisition, Operations, Finance, Department Head, Other) and growable the
  same combobox way. New stakeholders are auto-classified into this catalog
  from their `jobTitle` by keyword match; the field stays independently
  editable to correct a bad guess.
- **`candidate_role_type`** is the same create+read-only combobox-catalog
  pattern again, for the Candidate form's Role Type field — its own catalog
  (employment type: Permanent/Contract/...), not shared with
  `stakeholder_role_type` (a functional/department classification). No
  seeded starting set or auto-classification — added purely as consultants
  type new values into the combobox.
- **`saved_search`** is a different shape entirely: **personal, owner-scoped
  data**, not a shared catalog. A consultant's own saved candidate searches
  (`CandidateSavedSearch`, filter state as JSON) — `create`/`read`/`delete`
  only (no `update`; renaming isn't supported, delete + re-save covers it).
  `GET /candidates/saved-searches` always scopes to the caller's own
  `consultantId`; `DELETE .../:id` 404s (not 403) on an id that exists but
  belongs to someone else, so a saved search's existence isn't probeable by
  id across consultants.
- There is **no `user` resource.** The app's identity table is **`Consultant`**;
  the admin "user management" screen was folded into **`/consultants`** and the
  old `user` permission was removed from the seed and pruned from the database.

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
| `GET/POST/PATCH/DELETE /candidates` | `candidate:*` | per matrix |
| `GET/POST/PATCH/DELETE /clients` | `client:*` | per matrix |
| `GET/POST/PATCH/DELETE /stakeholders` | `stakeholder:*` | per matrix |
| `POST /stakeholders/:id/contact-history` | `stakeholder:update` | admin, manager, consultant, researcher — `contactedById` is always the caller, never request-supplied |
| `POST /candidates/:id/contact-history` | `candidate:update` | admin, manager, consultant, researcher — `contactedById` is always the caller, never request-supplied |
| `GET/POST /stakeholder-role-types` | `stakeholder_role_type:read` / `:create` | admin, manager, consultant, researcher |
| `GET/POST /candidate-role-types` | `candidate_role_type:read` / `:create` | admin, manager, consultant, researcher |
| `GET/POST /candidates/saved-searches` | `saved_search:read` / `:create` | admin, manager, consultant, researcher — always scoped to the caller's own consultantId |
| `DELETE /candidates/saved-searches/:id` | `saved_search:delete` | admin, manager, consultant, researcher — 404s if the id belongs to another consultant |
| `GET/POST/PATCH/DELETE /job-orders` | `job_order:*` | per matrix |
| `GET /candidates/:id/pipeline-timeline` | `candidate:read` | scoped to a candidate the caller can already read, not `audit:read` |
| `GET /job-orders/:id/pipeline-timeline` | `job_order:read` | scoped to a job order the caller can already read, not `audit:read` |
| `GET/POST/PATCH/DELETE /candidate-submissions` | `submission:*` | per matrix |
| `GET /consultants` | `consultant:read` | admin, manager |
| `POST /consultants` | `consultant:create` | admin, manager (no privileged roles for managers) |
| `PATCH/DELETE /consultants/:id` | `consultant:update` / `:delete` | **admin only** (service guard) |
| `GET/PATCH /consultants/me` | — (auth only) | everyone |
| `GET/POST/PATCH/DELETE /roles` | `role:*` | admin, manager |
| `GET /permissions` | `permission:read` | admin, manager |
| `GET/POST /industries` | `industry:read` / `:create` | admin, manager, consultant, researcher |
| `GET/POST /specializations` | `specialization:read` / `:create` | admin, manager, consultant, researcher |
| `GET /audit-logs` | `audit:read` | admin |
