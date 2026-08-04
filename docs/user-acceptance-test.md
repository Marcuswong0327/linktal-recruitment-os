# Linktal Recruitment OS — User Acceptance Testing (UAT)

|                     |            |
| ------------------- | ---------- |
| **Prepared for**    | Linktal    |
| **Document status** | Ongoing    |
| **Last updated**    | 2026-07-20 |

---

## Table of Contents

1. [Purpose of Document](#1-purpose-of-document)
2. [Roles Covered](#2-roles-covered)
3. [Modules](#3-modules)
   1. [Authentication & Profile](#31-authentication--profile)
   2. Companies (Clients & Stakeholders) — _pending_
   3. Job Orders — _pending_
   4. Candidates — _pending_
   5. [Consultants (Admin)](#35-consultants-admin)
   6. Roles & Permissions (Admin) — _pending_
   7. Activity Log (Admin) — _pending_
4. [Planned Features (Out of Scope)](#4-planned-features-out-of-scope)
5. [Sign-off](#5-sign-off)

---

## 1. Purpose of Document

This document lists the expected behaviour of the Linktal Recruitment OS, organised by module, so it can be checked off against the live application before going live and after each iteration of development.

Features that are listed as test cases are ones that are actually built and reachable in the app today. Some features that exist in navigation or have ghost buttons are pending ones that will be built while the project continues.

| Status  | Meaning                                                          |
| :-----: | ---------------------------------------------------------------- |
|  Pass   | Behaved as expected                                              |
|  Fail   | Did not behave as expected — note the actual and expected result |
| Blocked | Couldn't be tested (e.g. a precondition failed)                  |
|   N/A   | Not applicable to this environment/role                          |

Each module section owns its own ID prefix (`AUTH-`, `COMP-`, `JO-`, `CAND-`, `CON-`, `ROLE-`, `LOG-`). When a feature changes, update the affected row in place rather than renumbering — IDs are referenced in bug reports and should stay stable across releases. Add new rows at the end of a section's table with the next free number.

---

## 2. Roles Covered

Every module below should be tested against each role that can reach it. Roles with
no access to a given module are explicitly marked **No access** in that module's
table rather than omitted, so it's clear that was verified, not overlooked.

| Role           | Description                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| **Admin**      | Full system access; manages users, roles, and sees the activity log          |
| **Manager**    | Full operational access (Companies, Job Orders, Candidates); no admin UI     |
| **Consultant** | Full day-to-day workflow access on their own recruitment work                |
| **Finance**    | Read-only visibility into Companies, Job Orders, and Placements-related data |
| **Researcher** | Research + upload workflow only — no screening notes, no placements          |
| **Viewer**     | Read-only across the app; the default role for a brand-new sign-up           |

Full permission matrix: [`docs/rbac-roles.md`](./rbac-roles.md).

---

## 3. Modules

### 3.1 Authentication & Profile

Covers `/sign-in` and `/profile`. Two sign-in methods are supported:

- Microsoft Entra ID (SSO)
- Email + Password

| ID      | Role(s)                             | Test Scenario                                                   | Steps                                                                                                                                                       | Expected Result                                                                                                                               | Status |
| ------- | ----------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AUTH-01 | All (existing Azure-linked account) | Sign in with Microsoft (Happy Flow)                             | 1. Go to `/sign-in`.<br>2. Click **Sign in with Microsoft**.<br>3. Complete Microsoft login with your work account.                                         | Redirected to Dashboard; role/permissions match the account's assigned role.                                                                  |        |
| AUTH-02 | New user                            | First Microsoft Sign-in (Happy Flow)                            | Sign in with Microsoft with an `@linktal.com.au` account that has never signed in before.                                                                   | Account is created automatically with the **Viewer** role; user lands on Dashboard with read-only access.                                     |        |
| AUTH-03 | New user                            | First Microsoft Sign-in (Unhappy Flow)                          | Attempt to sign in with Microsoft using an account outside the `@linktal.com.au` tenant.                                                                    | Microsoft rejects the sign-in — the account isn't part of the allowed organization/tenant.                                                    |        |
| AUTH-04 | Any (pre-imported consultant)       | First Microsoft Sign-in Linking an Imported Record (Happy Flow) | Sign in with Microsoft using the account of a consultant already in the system (e.g. imported from Excel) but never linked to Azure before.                 | Existing record is linked to the Microsoft account (no duplicates created); user keeps their previously assigned role.                        |        |
| AUTH-05 | All                                 | Email + Password Sign-in (Happy Flow)                           | 1. Go to `/sign-in`.<br>2. Enter a registered email and correct password.<br>3. Click **Sign in**.                                                          | Redirected to Dashboard.                                                                                                                      |        |
| AUTH-06 | All                                 | Email + Password Sign-in (Unhappy Flow)                         | 1. Go to `/sign-in`.<br>2. Enter an unregistered email, or a registered email with the wrong password.                                                      | Generic error: "Incorrect email or password." (Doesn't reveal whether the email exists.)                                                      |        |
| AUTH-07 | New user                            | Self-Registration — New Email (Happy Flow)                      | 1. Click **Don't have an account? Create one**.<br>2. Fill in Name, Email, Password (8+ characters).<br>3. Submit.                                          | Message: "Your account has been created and is pending admin approval." No session is created — user is **not** signed in.                    |        |
| AUTH-08 | New user                            | Self-Registration — Email Already Registered (Unhappy Flow)     | Register using an email that already belongs to an existing password-based account.                                                                         | Error: "An account with this email already exists — try signing in instead."                                                                  |        |
| AUTH-09 | Any (pre-imported consultant)       | Self-Registration — Linking an Imported Record (Happy Flow)     | Register using the email of a consultant imported from Excel that has no password set yet.                                                                  | Password is attached to the existing record (no duplicate). If that record is active, user is signed in immediately with their existing role. |        |
| AUTH-10 | Admin (setup) + Deactivated user    | Sign-in Blocked for Deactivated Account (Unhappy Flow)          | 1. As Admin, deactivate a consultant (see CON test cases).<br>2. As that user, attempt to sign in (either method).                                          | Error: "Your account has been deactivated. Contact your administrator for access." Sign-in is denied.                                         |        |
| AUTH-11 | Admin (setup) + Any active user     | Deactivation Takes Effect Mid-Session (Unhappy Flow)            | 1. User A is signed in and using the app.<br>2. As Admin (separate session), deactivate User A.<br>3. User A performs any action (navigate, save a record). | User A is signed out / blocked immediately — does not have to wait for their session to expire.                                               |        |
| AUTH-12 | All                                 | Visiting `/sign-in` While Already Signed In                     | While signed in, navigate directly to the `/sign-in` URL.                                                                                                   | Automatically redirected to Dashboard.                                                                                                        |        |
| AUTH-13 | All                                 | Sign Out                                                        | From the account menu, click **Sign out**.                                                                                                                  | Session ends; visiting any protected page afterwards redirects to `/sign-in`.                                                                 |        |
| AUTH-14 | All                                 | View Profile                                                    | Navigate to `/profile`.                                                                                                                                     | Shows name, email, avatar, assigned role badge, and Consultant ID. Fields are read-only — there is currently no self-service edit form.       |        |

### 3.5 Consultants (Admin)

Covers `/consultants` — a list of every consultant (recruiter) account, where an
Admin manages role and active status. There is currently **no "add consultant"
form** — new accounts only appear here via self-registration ([AUTH-07](#31-authentication--profile))
or a Microsoft sign-in ([AUTH-02](#31-authentication--profile)/[AUTH-04](#31-authentication--profile)); an
Admin approves a pending self-registration by switching that row's Status to Active.

This page is **Admin-only in the UI** — even though some other roles hold
read/create permissions on the underlying `consultant` resource (see
[`docs/rbac-roles.md`](./rbac-roles.md)), the nav item and page are hidden from
everyone except the Admin role.

| ID     | Role(s)                                            | Test Scenario                                                | Steps                                                                                                                             | Expected Result                                                                                                                                | Status |
| ------ | --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| CON-01 | Admin                                               | View Consultants List (Happy Flow)                              | Navigate to `/consultants`.                                                                                                       | Table lists every consultant with Name, Email, Role, Status, and Joined date; search box and Role/Status filters are available.                   |        |
| CON-02 | Manager, Consultant, Finance, Researcher, Viewer    | Access Consultants Page (Unhappy Flow — No Access)              | Sign in as a non-Admin role and try to reach `/consultants` (nav item is hidden — try the direct URL too).                        | "Access Denied" is shown, regardless of that role's underlying `consultant` permission.                                                          |        |
| CON-03 | Admin                                                | Approve a Pending Self-Registered Account (Happy Flow)          | Locate the newly self-registered consultant (Status = Inactive), change **Status** to **Active**.                                | Row updates to Active; success toast; that person can now sign in ([AUTH-07](#31-authentication--profile)).                                       |        |
| CON-04 | Admin                                                | Deactivate a Consultant (Happy Flow)                             | Change another consultant's **Status** to **Inactive**.                                                                          | Success toast; that consultant is immediately blocked from signing in / using the app ([AUTH-10](#31-authentication--profile)/[AUTH-11](#31-authentication--profile)). |        |
| CON-05 | Admin                                                | Change a Consultant's Role (Happy Flow)                          | Change another consultant's **Role** dropdown to a different role.                                                               | Success toast; that consultant's permissions match the new role on their next request.                                                            |        |
| CON-06 | Admin                                                | Bulk Update Role/Status (Happy Flow)                             | Select several consultants via the row checkboxes, then **Bulk actions → Set role** (or **Set status**).                        | A summary toast reports how many succeeded/failed; all selected rows update accordingly.                                                          |        |
| CON-07 | Admin                                                | Self-Lockout on Own Row (Unhappy Flow)                           | Find your own row in the list.                                                                                                    | Your own row can't be selected for bulk actions, and its Role/Status controls are disabled — you cannot change your own role or deactivate yourself here. |        |
| CON-08 | Admin                                                | Cannot Demote/Deactivate the Last Active Admin (Unhappy Flow)    | With exactly one active Admin in the system, attempt (from a different admin account) to change that admin's role away from Admin, or set their Status to Inactive. | Blocked with: "Cannot demote or deactivate the last active admin."                                                                                 |        |
| CON-09 | Admin                                                | Search & Filter Consultants (Happy Flow)                         | Type into the search box, and/or apply the Role and Status filter pills.                                                        | List narrows to matching consultants; filters can be combined.                                                                                     |        |

---

## 4. Planned Features (Out of Scope)

The following are visible as disabled items in the navigation but are not yet built,
so no test cases exist for them yet. They'll get their own section once shipped:
**Submissions** (standalone page — today's submission workflow lives inside a Job
Order's detail page), **Interviews**, **Placements**, **Tasks**, **Inbox**, **Settings**.

---

## 5. Sign-off

| Role                | Name | Signature | Date |
| ------------------- | ---- | --------- | ---- |
| Linktal stakeholder |      |           |      |
| Delivery team       |      |           |      |
