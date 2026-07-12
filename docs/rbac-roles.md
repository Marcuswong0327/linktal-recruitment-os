# RBAC — Roles, Permissions & Conditions

How authorization works in the Linktal API: the six roles, the permission matrix
they're seeded with, and the **conditional rules** enforced in code that the
permission table alone can't express.

> Source of truth: `apps/api/prisma/seed.ts` (the matrix) plus the service-level
> guards noted below. Re-run `pnpm --filter @linktal/api seed` after editing the
> matrix.

---

## 1. How a request is authorized

Every request passes two guards:

1. **`AuthGuard`** — verifies the Neon Auth JWT, resolves the caller to a
   `Consultant`, and attaches `{ roleName, permissions, isActive, … }`.
   - Identity is matched by `neonUserId`, then by `email` on first login (which
     links a pre-created consultant), else a new consultant is provisioned as
     **`viewer`**.
   - **`isActive = false` → login is rejected** (`403 ACCOUNT_INACTIVE`), even
     with a valid token. This is how access is revoked (see §5).
2. **`PermissionsGuard`** — if the route declares `@RequirePermission(resource, action)`,
   the caller must hold `resource:action` or gets **`403 FORBIDDEN`**.

Routes with no `@RequirePermission` (e.g. `/consultants/me`, `/health`) only need
authentication.

---

## 2. Permission matrix

Actions: **C**reate · **R**ead · **U**pdate · **D**elete. `–` = no access.
(The `permission` resource is read-only by design — see §4.)

| Resource | admin | manager | consultant | finance | researcher | viewer |
|----------|:-----:|:-------:|:----------:|:-------:|:----------:|:------:|
| candidate     | CRUD | CRUD | CRUD | –  | CRU | R |
| client        | CRUD | CRUD | CRUD | R  | CRU | R |
| stakeholder   | CRUD | CRUD | CRUD | –  | CRU | R |
| job_order     | CRUD | CRUD | CRUD | R  | R   | R |
| job_research  | CRUD | CRUD | CRUD | –  | CRU | R |
| submission    | CRUD | CRUD | CRUD | –  | R   | R |
| placement     | CRUD | CRUD | CRUD | R  | R   | R |
| consultant    | CRUD | CRUD | –    | –  | –   | – |
| role          | CRUD | CRUD | –    | –  | –   | – |
| permission    | R    | R    | –    | –  | –   | – |
| report        | CRUD | CR   | –    | CR | –   | – |
| **Total perms** | **41** | **39** | **28** | **5** | **15** | **7** |

Plain-English summary:

| Role | Intent |
|------|--------|
| **admin** | Full system access, including user & role management. |
| **manager** | Sees everything; full CRUD on business data + consultants + roles; **no** delete on RBAC internals, and constrained by the conditions in §3. |
| **consultant** | Full workflow CRUD on recruitment entities; no access to the consultant directory, roles, or permissions. |
| **finance** | Read placements/clients/job orders; create/read reports. |
| **researcher** | Create/read/update research + candidate/client/stakeholder uploads; read-only on the workflow. |
| **viewer** | Read-only across the recruitment entities. |

---

## 3. Conditional rules (enforced in code, not the matrix)

The permission table is resource-level; these rules depend on the *target's*
state, so they live in the services.

### Consultants (`/consultants`, guarded by `consultant`)
- Only **admin/manager** reach these routes at all.
- **Managers may not assign privileged roles or manage admins:** a manager cannot
  create or promote anyone to the **admin or manager** role, and cannot edit or
  delete an **admin**-role consultant. Those are admin-only (`403`).
- **Last-admin protection:** no one can demote, deactivate, or delete the **final
  active admin** (`409`). At least one active admin always exists.
- **Not settable via the API:** `displayId` (DB sequence `consultant-####`) and
  `neonUserId` (set by auth on login-link).
- **Editable fields:** `email`, `fullName`, `roleId`, `isActive` (subject to the
  rules above).

### Self-service (`/consultants/me`, any authenticated user)
- `GET /consultants/me` — your own profile.
- `PATCH /consultants/me` — edits **`fullName` only**. It can **never** change
  your own `roleId` or `isActive`; privilege-affecting changes must go through the
  admin/manager-guarded `/consultants/:id`.

### Roles (`/roles`, guarded by `role`)
Two structural rules apply to everyone (incl. admins):
- **The `admin` role is immutable** — nobody can edit or delete it (keeps the
  superuser intact).
- **Built-in roles are undeletable** — the six seeded roles (admin, manager,
  consultant, finance, researcher, viewer) can't be deleted by anyone; only
  **custom** roles created via the API can. Built-ins can still be *edited*
  (except `admin`).
- **Delete needs an empty role** — a role with consultants assigned can't be
  deleted (`409`); reassign those people first so no one is orphaned.

On top of that:
- **admin** — create custom roles (any permissions); read all; update any role
  except `admin`; delete custom roles (subject to the empty-role rule).
- **manager** — create custom roles; read all; update/delete every role **except
  `admin` and `manager`** (and only custom roles are deletable), and:
  - **Escalation guard:** may only grant a role permissions the manager
    *themselves hold* — so a manager can't mint a role more powerful than they
    are.

### Permissions (`/permissions`, guarded by `permission:read`)
- **Read-only catalog.** No create/update/delete endpoints — the permission set
  is static, defined in the seed. Used to populate the role editor's picker.
- Visible to **admin/manager only**.

---

## 4. Why `permission` is read-only, and `user` doesn't exist

- **`permission`** is the fixed catalog of `resource:action` pairs. You never
  create permissions at runtime — you attach existing ones to roles. So the
  resource only has a `read` action; `permission:create/update/delete` were
  removed from the seed.
- There is **no `user` resource or model.** Login accounts live in Neon Auth; the
  app's identity table is **`Consultant`**. The old `user` permission label was
  vestigial and has been removed.

---

## 5. Access lifecycle & revocation

| Goal | Do this | Not this |
|------|---------|----------|
| **Revoke someone's access** | Set `isActive = false` (blocks login immediately) | **Don't** delete the consultant — a hard delete just re-provisions them as a fresh `viewer` on next login |
| **Pre-create a teammate** | `POST /consultants` with their email + role (no `neonUserId`). It auto-links on their first login | — |
| **Change someone's role** | `PATCH /consultants/:id` (admin/manager, subject to §3) | Not via `/me` |
| **Let users fix their own name** | `PATCH /consultants/me` | — |

---

## 6. Endpoint → required permission

| Endpoint | Permission | Roles with access |
|----------|-----------|-------------------|
| `GET/POST/PATCH/DELETE /candidates` | `candidate:*` | per matrix |
| `GET/POST/PATCH/DELETE /clients` | `client:*` | per matrix |
| `GET/POST/PATCH/DELETE /stakeholders` | `stakeholder:*` | per matrix |
| `GET/POST/PATCH/DELETE /job-orders` | `job_order:*` | per matrix |
| `GET/POST/PATCH/DELETE /consultants` | `consultant:*` | admin, manager |
| `GET/PATCH /consultants/me` | — (auth only) | everyone |
| `GET/POST/PATCH/DELETE /roles` | `role:*` | admin, manager |
| `GET /permissions` | `permission:read` | admin, manager |
