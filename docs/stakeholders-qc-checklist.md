# Stakeholders — QC Checklist

> **Historical.** Written when Coverage was first added, against the old
> GeoNames-scale Location tree (COUNTRY ▸ STATE ▸ CITY ▸ SUBURB). Issue #157
> replaced that with a two-rung Country / City Coverage catalog — level
> references below (STATE/CITY/SUBURB, "Coverage" as a bare label) describe
> that earlier shape, not current behaviour. Kept as a record of what was
> tested, not a checklist to re-run as written.

Scope: `apps/web/src/features/stakeholders/**` + new `apps/web/src/components/LocationMultiSelect.tsx`,
tested against `apps/api/src/stakeholders/**`.

## What changed (for context, not to re-verify line by line)

- `api.ts` and `schema.ts` (hand-rolled fetch wrappers + local `Stakeholder` type) were **deleted**.
  Everything now goes through the orval-generated client (`@/lib/api/generated/stakeholders/stakeholders`,
  `@/lib/api/generated/types`). `stakeholderFullName` moved into `columns.tsx`.
- New **Coverage** field (`coverageLocationIds` / `coverage`) — which `Location` nodes a stakeholder
  personally covers, independent of their client's location. Editable via the new shared
  `LocationMultiSelect` component, on both the create sheet and the detail/edit page.
- Various `as UpdateStakeholderDto` / `as unknown as CreateStakeholderContactHistoryDto` casts appeared
  where the generated DTO types `null`-clearing fields as `undefined`-only.

Test as each role: **admin, manager, consultant (in-scope), consultant (out-of-scope), finance, researcher, viewer.**
Per `docs/rbac-roles.md` §2, stakeholder permissions are: admin `CRUD`, manager `CRUD`, consultant `CRUD` (scoped),
finance `–` (no access at all), researcher `CRU` (no delete), viewer `R` only.

---

## 1. Page access per role

- [ ] **finance**: `/stakeholders` shows `AccessDenied` (no `stakeholder:read`). Confirm no console errors trying to fetch anyway.
- [ ] **viewer**: page loads, list is read-only — no "Add Stakeholder" button, no inline edit controls, no delete.
- [ ] **researcher**: page loads with create + update, but **no delete** (no bulk-delete menu item, no delete button on detail page).
- [ ] **admin / manager**: full access, all controls visible.
- [ ] **consultant**: full CRUD controls visible, but list/detail content is scoped (see §7).
- [ ] Direct-linking `/stakeholders/[id]` for a disallowed role (finance) shows `AccessDenied`, not a crash or blank page.
- [ ] Direct-linking `/stakeholders/[id]` for a scoped-out consultant on an in-scope-_client_ but out-of-scope-_coverage_ stakeholder — confirm 403/404 behavior, not a silent wrong render.

Requests:

- For viewer, can we also remove the log contact option in the stakeholder's table

## 2. List page (`StakeholdersTable`)

- [ ] Table loads with columns: Name, Company, Coverage, Role type, Job title, Email, Mobile, Accuracy, Last contacted, log-contact icon.
- [ ] Coverage column shows up to 2 location badges + "+N more"; shows "—" when a stakeholder has none. Not sortable, but is filterable (header filter button, same `LocationFilterButton` as Company's Market) — `locationIds` is matched against the stakeholder's own coverage via the ancestor path, so selecting a country/state also matches stakeholders covering anything beneath it, same semantics as `Client.locationIds`.
- [ ] Loading skeleton / `isFetching` spinner behaves during page changes.
- [ ] Error state renders if the API call fails (kill the API and reload, or throttle to confirm the "Failed to load stakeholders" message shows).
- [ ] Free-text search (`q`) matches firstName, lastName, email, displayId, mobile.
- [ ] Role type filter (single-select dropdown with colored badges) filters correctly and clears correctly.
- [ ] Sorting works only on the enabled columns (displayId, firstName, lastName, createdAt, lastContactedAt) — Company/Role type/Job title/Email/Mobile are **not** sortable (`enableSorting: false`), confirm no sort arrow appears on those headers.
- [ ] `lastContactedAt` sort puts stakeholders with no contact history **last**, both asc and desc.
- [ ] Pagination (20/page) — page count, next/prev, and that filters+search reset to page 1.
- [ ] Row click navigates to `/stakeholders/[id]`.
- [ ] Row range-select (shift-click / drag) works and doesn't conflict with inline Role type / Accuracy pickers or the "log contact" icon (click inside those must `stopPropagation`, not select the row or navigate).
- [ ] "Add a Stakeholder" via command palette (`/stakeholders?new=1`) opens the create sheet and strips the query param (refresh/back doesn't reopen it).

## 3. Create ("Add Stakeholder" sheet)

- [ ] Only **Company** is required — Save is disabled until a client is chosen, everything else optional.
- [ ] All fields submit correctly: firstName, lastName, jobTitle (creatable combobox), roleType (creatable combobox), linkedinUrl, email, mobile, **Coverage**, isAccurate (unchecked/true/false), inaccurateReason (only shown when Inaccurate).
- [ ] Creating a job title inline via the combobox actually persists it (`POST /job-titles`) and is selectable immediately without a page refresh.
- [ ] Creating a role type inline via the combobox actually persists it (`POST /stakeholder-role-types`) and is selectable immediately.
- [ ] Leaving Role type empty → backend auto-classifies one from the job title's keywords (see `role-type-classifier.ts` / `classifyRoleTypeId`) — verify the created stakeholder ends up with a sensible non-null `roleType` even though you never picked one.
- [ ] Explicitly picking a Role type overrides the auto-classification.
- [ ] Coverage: search-as-you-type (min 2 chars, 300ms debounce), pick multiple locations, remove one via its pill's `×`, confirm the saved stakeholder shows the right `coverageLocationIds`.
- [ ] Coverage is genuinely optional — creating with none set works fine.
- [ ] URL validation on LinkedIn (`https://…`), email validation, and length limits (`firstName`/`lastName` 60 chars, `mobile` 30, `inaccurateReason` 1000) are enforced or at least don't silently corrupt data if exceeded.
- [ ] Cancel button discards the draft without creating anything.
- [ ] Success toast "Stakeholder added", sheet closes, new row appears in the list (query invalidation) without a manual refresh.
- [ ] **Consultant, scoped**: creating a stakeholder on a client outside the consultant's industry/location scope, with coverage also outside scope → rejected with `CONSULTANT_SCOPE_MISMATCH`-style error (see `assertResultInScope`), surfaced as a toast, not a silent failure.
- [ ] **Consultant, scoped**: creating a stakeholder on an out-of-scope client but with **in-scope coverage** succeeds (this is the documented asymmetry — "a Sydney consultant logging a Sydney-covering contact at a Brisbane company in an industry they don't hold" is allowed).

## 4. Detail / edit page (`StakeholderDetail`)

- [ ] Header shows avatar initials (or `?` if no name), display name (or "Unnamed contact"), accuracy badge, role type badge (only if set), `displayId · companyName`.
- [ ] `canEdit=false` (viewer): every field is disabled, no "Save changes" button, Coverage picker disabled (badges show but no remove `×`).
- [ ] `canEdit=true`: editing any field enables "Save changes" and shows "Unsaved changes" + the dirty state; unmodified form keeps Save disabled.
- [ ] Cmd/Ctrl+Enter (the `Kbd` hint shown on the Save button) actually submits the form.
- [ ] Editing then navigating away (back button / link) triggers the "Unsaved changes" confirmation dialog; "Stay" cancels navigation, "Discard Changes" proceeds.
- [ ] All fields save correctly: firstName, lastName, jobTitle, roleType, linkedinUrl, email, mobile, isAccurate, inaccurateReason, **coverage**.
- [ ] **Coverage dirty-tracking specifically**: `isDirty` is computed via a sorted-id-join comparison — verify that re-adding then removing the same location (net no-op) still correctly resolves to "not dirty", and that reordering selections without changing membership doesn't falsely mark dirty.
- [ ] **Coverage seeding on load**: existing coverage pills show the right names (zipped from `coverage`/`coverageLocationIds`) but **no level badge** (COUNTRY/STATE/CITY/SUBURB) since level isn't returned by the API for pre-existing pills — confirm this doesn't look broken, just less detailed than freshly-picked pills.
- [ ] Picking a **broader** region (a whole state/country) as coverage — confirm this is understood as "covers everywhere inside it" per the card's description; no UI actually visualizes the descendant set, so just confirm the description text and downstream scope behavior (§7) agree.
- [ ] Setting Accuracy to "Inaccurate" reveals the "What's wrong" textarea; switching back to Accurate/Unchecked hides it again (verify the value isn't silently retained and resubmitted after hiding, if that matters to you).
- [ ] "Log contact" button opens `LogContactSheet`; submitting logs a new `StakeholderContactHistory` row and updates "Last contact" card (When/Method/By/Notes) after invalidation.
- [ ] Logging a contact with a **backdated** timestamp (older than the existing `lastContactedAt`) does **not** overwrite the denormalized `lastContactedAt` on the stakeholder or its client (server-side guard in `addContactHistory`) — confirm the "Last contact" card still shows the newer one, not your backdated entry.
- [ ] Logging a contact with a newer timestamp **does** bump both the stakeholder's and the parent client's `lastContactedAt`.
- [ ] `canDelete=false`: no Delete button on the detail page.
- [ ] `canDelete=true`: Delete → confirm dialog → delete-with-undo toast → navigates back to `/stakeholders` immediately (nothing actually deleted from the server until the undo window elapses) → confirm Undo within the window actually restores it (list still shows it after undo) and letting it commit actually removes it.
- [ ] Stakeholder-not-found (`404`, or a bad id) renders the "Stakeholder not found" state with a working "Back to stakeholders" link, not a crash.

## 5. Inline row edits (list page)

- [ ] Role type combobox (list row) — changing it fires an update, shows "Role type updated" toast, disables just that row while pending (other rows stay interactive).
- [ ] Clearing Role type back to empty via the combobox correctly nulls it server-side (not left as `undefined`/no-op) — this is the documented `as UpdateStakeholderDto` cast; make sure it actually persists as "Uncategorized" after a refresh, not silently ignored.
- [ ] Accuracy combobox (list row) — same pending/toast behavior; clearing back to "Unchecked" (`null`) actually persists as unchecked, not left at its previous value.
- [ ] `canUpdate=false` (viewer): Role type and Accuracy cells render as plain text, no pickers.
- [ ] Row range-select drag doesn't accidentally trigger these inline pickers, and clicking a picker doesn't trigger row selection/navigation.

## 6. Bulk actions (multi-select on list)

- [ ] Selecting rows shows the "Bulk actions (N)" button (toolbar) and a right-click context menu on the selection with the same actions.
- [ ] **Export to Excel** is a standalone, always-visible toolbar button (not gated on selection) plus a right-click context-menu entry. It's server-side now (`POST/GET /stakeholders/export`, see `StakeholdersService.exportAll`/`exportByIds`) — with a selection it exports exactly those rows; with none selected it exports every stakeholder matching the current filters, unbounded (not just the current page). Confirm exported columns match `StakeholdersService.buildExportWorkbook` (Contact Name, Company, Coverage, Role type, Job title, Email, Mobile, Details accurate, Last Contacted Date/Time/Method/By, Last Contact Notes), with a bold+frozen header row and the date/time columns in the viewer's own timezone.
- [ ] "Mark details" → Accurate / Inaccurate bulk-updates all selected, shows a summary toast ("Marked N as Accurate"), partial failures show a separate error toast with the failed count.
- [ ] Bulk actions menu hides "Mark details" entirely when `canUpdate=false`.
- [ ] Bulk delete hides entirely when `canDelete=false` (researcher, viewer).
- [ ] Bulk delete → confirm dialog ("Delete N stakeholders?") → delete-with-undo → partial failure surfaces "Failed to delete X of N stakeholders" → Undo restores all of them (not just the successful ones, since nothing was actually sent until commit).
- [ ] Selection clears (`setSelected([])`) after bulk update and bulk delete.
- [ ] Bulk-updating while a previous bulk update is still in flight is prevented / doesn't race (`isBulkUpdating` disables the trigger button and shows "Updating…").

## 7. Scope / visibility (consultant role specifically)

Reference: `docs/scope-explained.md` — Stakeholder is matched on its **own coverage**, not the client's location; `clientScope` is `consultantId = me OR industry OR locations OR stakeholders.some(coverage)`.

- [ ] A consultant with no industry/location grants sees **zero** stakeholders (not "everything") — confirm the wildcard-must-be-explicit rule holds.
- [ ] A consultant whose grant is `industry` only sees stakeholders whose **parent client's** industry matches — independent of the stakeholder's own coverage.
- [ ] A consultant whose grant is a **location** sees stakeholders whose own coverage falls under that location (a descendant node), even if the parent client sits somewhere else entirely.
- [ ] A stakeholder covering a **broader** node (e.g. a whole state) is visible to a consultant granted any narrower descendant location under it (a CITY grant should see coverage set to the parent STATE/COUNTRY, per "a node covers itself plus every descendant" — double check the direction: does a _narrow_ grant see _broad_ coverage, or only the reverse? Confirm against `stakeholderScope` in `common/scope.ts` rather than assuming).
- [ ] Editing an existing stakeholder's coverage so it moves **out of** the editing consultant's scope is allowed (per the code comment: "correcting a contact's territory is honest note-keeping... the record stays fully visible to admins, managers and whoever does cover the new patch") — confirm after save the consultant simply loses visibility of it (no error), and an admin/manager can still see it fine.
- [ ] Editing a stakeholder's **`clientId`** (re-parenting to a different company) **is** re-checked against scope (`assertResultInScope` fires when `dto.clientId !== undefined`) — confirm re-parenting to an out-of-scope client is rejected.
- [ ] A stakeholder is always visible to a consultant who is its **owner** — re-check whether "owner" even applies here, since `Stakeholder` has no `consultantId` (per CLAUDE.md, "Stakeholder is the exception, having no `consultantId`") — confirm there's no dangling assumption anywhere in the UI that a stakeholder has an assigned consultant.
- [ ] Finance/researcher/viewer/admin/manager are **unrestricted** — confirm they see the full stakeholder list regardless of scope grants (per the RBAC doc, scoping only applies to the `consultant` role).

## 8. `LocationMultiSelect` component itself

(New shared component — also worth a quick standalone pass since it's now reused, not just stakeholder-specific.)

- [ ] Typing under 2 characters shows "Type at least 2 characters to search." and does **not** fire a request.
- [ ] Typing 2+ characters, debounced 300ms, fires `GET /locations?q=...&take=20`; a loading spinner shows while `isFetching`.
- [ ] No results shows "No locations found."
- [ ] Each result row shows its level (Country/State/City/Suburb).
- [ ] Selecting a result adds a pill with name + level badge; selecting the same item twice doesn't duplicate it.
- [ ] Removing a pill via its `×` doesn't reopen/close the dropdown unexpectedly, and doesn't trigger the parent row's click handler when used inside `StakeholdersTable`'s row-context usages (n/a here — Coverage only lives in forms — but verify anyway since the component is now shared).
- [ ] `disabled` prop: pills render without the `×`, trigger is inert, no dropdown opens on click.
- [ ] Keyboard: remove a pill via Enter/Space on its focused `×` (accessibility path), not just mouse click.
- [ ] Rapid typing (faster than the debounce) doesn't fire a request per keystroke — only after the user pauses.
- [ ] Switching the query mid-fetch (stale response race) doesn't let an old response's results clobber a newer query's list (`keepPreviousData` + `resultsById` — confirm no visible flicker/wrong-list bug).

## 9. Regression check: generated-client migration

Since `api.ts`/`schema.ts` were deleted in favor of the orval-generated client:

- [ ] No leftover imports anywhere in the repo still reference `features/stakeholders/api` or `features/stakeholders/schema` (`grep -rn "stakeholders/api'\|stakeholders/schema'" apps/web/src` should be empty).
- [ ] `pnpm typecheck` passes clean for `apps/web` (the various `as UpdateStakeholderDto` / `as unknown as CreateStakeholderContactHistoryDto` casts are exactly the kind of thing that silently masks a real type mismatch — worth a second look, not just trusting the cast).
- [ ] Network tab: confirm requests actually hit the expected generated-client paths/params (e.g. `useGetStakeholderRoleTypes({ take: 200 })`, `useGetJobTitles({ take: 200 })`) and that raising real catalogs past 200 rows wouldn't silently truncate the combobox options (flag if so — not necessarily fix here).
- [ ] `pnpm lint` clean for the touched files.

## 10. Cross-feature sanity

- [ ] Client detail page (if it lists its stakeholders) still renders correctly given `StakeholderEntity` shape changes.
- [ ] Global search / command palette entries for stakeholders (if any) still resolve correctly.
- [ ] `stakeholderFullName` used consistently everywhere a stakeholder's name is displayed (columns, detail header, delete-confirm dialog, log-contact sheet subject label, export) — no leftover spot still importing the old one from `schema.ts`.
