# Client Feedback Checklist — Current State

Audited against `dev` @ `2055111` ("Better UI 3"), working tree clean.
Every line below was verified in code, not from the previous status email.

**Since the last email to the client, 7 more items landed** (2, 4.1, 4.2, 6, 8,
9, 10) and one more is most of the way there (7). Four remain genuinely open
(11, 12, 14, 15).

---

## Summary

| | Count | Items |
|---|---|---|
| ✅ Done | 15 | 1, 2, 3, 4.1, 4.2, 5, 6, 8, 9, 10, 17, 18, 19, 20, 21 |
| 🟡 Partial | 1 | 7 |
| ⬜ Open | 4 | 11, 12, 14, 15 |

Items **13** and **16** do not appear in the client's list at all — worth
confirming with them whether those were dropped, renumbered, or missed.

---

## ✅ Done — confirmed in the last email

**1 — Excel-style add row under each overview**
`components/InlineAddRow.tsx` + a `use*NewRow` hook wired into all five
overviews: `CandidateNewRow`, `CompanyNewRow`, `JobOrderNewRow`,
`JobResearchNewRow`, `StakeholderNewRow`. Critical fields inline, the rest in
the detail view.

**3 — Global search**
`components/app-shell/GlobalCommandPalette.tsx`, backed by
`hooks/use-recent-searches.ts`. Searches candidates, companies and stakeholders
(name / email / mobile), each hit linking to its detail view, with a "Recent"
group shown when nothing is typed.

**5 — Page descriptions removed**
No `description` on the `PageHeader` for Job Orders, Companies, Stakeholders,
Job Opening Research or Candidates. (Dashboard, Consultants, Roles and Profile
still carry theirs — they weren't in scope.)

**17 — Log Call: date only**
`components/LogCandidateContactRow.tsx` uses `<input type="date">`; the time
component is gone.

**18 — "Outreach Campaign" rename, Contact Method removed**
`lib/candidate-contact-category.ts` maps `OUTREACH → 'Outreach Campaign'`, and
the Contact Method select is gone from the candidate contact row.
⚠️ **Worth flagging to the client:** an optional **Channel** select still
appears, but *only* when the note category is Outreach Campaign. If they read
that as the same field they asked us to remove, it's a one-line deletion.

**19 — Current & Expected Salary editable**
Registered form fields on `CandidateDetail.tsx` (~line 1210), dirty-tracked and
saved with the rest of the record.

**20 — "Suburb & Postcode" free text**
Free-text field on the candidate detail (`CandidateDetail.tsx:1192`) and the
overview column renamed to match (`features/candidates/columns.tsx:45`).

**21 — Employment History editable**
`WorkHistoryField` on the candidate detail — Title, Company and Period all
editable, diffed against the saved value and included in the update payload.

---

## ✅ Done — new since the last email

**2 — "Add Anything" bar removed**
No trace of it anywhere in the app shell. The top-right slot is now the command
palette trigger (item 3).

**4.1 — Job Orders defaults to ACTIVE**
`JobOrdersTable.tsx` opens with `statuses = ['ACTIVE']` and
`initialColumnFilters=[{ id: 'status', value: ['ACTIVE'] }]`. It's a default,
not a restriction — the user can widen the filter.

**4.2 — Logo removed from "No. of Cdd ING"**
`features/job-orders/columns.tsx` now renders a plain
`<span className="tabular-nums">{count}</span>`. The number is retained; the
icon is gone.

**6 — Job Order detail: Status editable**
`JobOrderDetail.tsx:241` — an editable status select saved with the rest of the
record.
⚠️ **Worth flagging:** the dropdown offers all four statuses (Active, Placed,
On Hold, Closed), not the three the client listed. **Placed** is normally set
automatically when a placement fills the order, so exposing it for manual
selection may or may not be wanted. Easy to hide if they'd rather it weren't
there.

**8 — Interview date and time combined, 15-minute intervals**
`components/DateTimeField.tsx` — one date input plus an hour roll and a minute
roll, where `minuteOptions = ['00','15','30','45']` (`lib/datetime.ts:23`). A
select rather than a native time input, so quarter-hours are true by
construction and a typed `:37` isn't possible. Used in both pipeline surfaces
(`JobOrderPipelineCard.tsx`, `PipelineSheet.tsx`).

**9 — Reversible outcomes, with NO blocking later YES**
Both halves are in `components/JobOrderPipelineCard.tsx`:
- *Reversible* — every tick/cross toggles back to undecided, and un-ticking CDD
  Accepted deletes the placement, which the API fully unwinds (submission back
  to INTERVIEWING, candidate to WARM, `filledCount` decremented and the order
  un-PLACED, client back to WARM if it was its only placement). A mis-click is
  correctable, not permanent.
- *NO blocks later YES* — a cross cascades forward. Not shortlisted ⇒ the
  interview gate closes, any interview is stamped FAILED, CDD is set to declined
  and the placement is cleared. A failed interview ⇒ CDD declined and the
  placement cleared.

**10 — Industry before specialization on Companies**
The specialization picker is `disabled` until an industry is chosen and shows
"Pick an industry first"; once chosen, `SpecializationPicker` queries with
`industryIds: [industryId]` so only that industry's specializations appear.
Applied consistently in `CompanyForm`, `CompanyDetail` and `CompanyNewRow`.

---

## 🟡 Partial

**7 — Job Order detail → Submit Candidate**

| Sub-item | State |
|---|---|
| Search by name / email / phone | ✅ `CandidateCombobox` — server-side search, with matched text highlighted (including digit-wise matching so a partial phone number highlights against a formatted one) |
| Display name, role type, location | ✅ Name on line 1; role type · location on line 2 (falling back to current role, then industry, so an untagged candidate is never a blank row); mobile · email on line 3 |
| Confirmation before submission | ✅ `components/ConfirmSubmitCandidateDialog.tsx` |
| Recently screened candidates in the empty state | ❌ **Not done** — the empty state is still the static "Type at least 2 characters to search." |

Only the last row is outstanding. It needs a "recently screened" source
(candidates with a recent `SCREENING` contact-history entry), which likely means
a small API addition rather than a frontend-only change.

---

## ⬜ Still open

**11 — "Market Location" replacing city selectors**
Not started. Companies, Candidates and the Dashboard still use GeoNames-backed
city pickers (`LocationCombobox`, `GridCellLocationCombobox`, and the
`cityIds` filters in `CompaniesSearchGate` / `CandidateSearchGate`).
*Note for planning:* this is the largest of the four. `Location` is a
scope-bearing hierarchy — the consultant visibility rule resolves through it —
so swapping the pickers for free text has to be reconciled with scoping rather
than done at the UI layer alone.

**12 — Preserve filters and results when returning from Enrich Stakeholders**
Not started. `StakeholderEnrichmentWorkspace` returns via a plain
`<Link href="/companies">`, and the Companies filters live in ordinary React
state in `CompaniesSearchGate` with no URL or session persistence — so the
round trip resets them. Fix is to lift the gate's filter state into the URL (or
session storage) and have the workspace return to that URL.

**14 — Company detail → Contact History: remove Contact Method and the time**
Not started. `components/LogContactRow.tsx` still renders a required
**Contact method** select (line 107) and a `<input type="datetime-local">` for
**When** (line 123). This is the direct analogue of items 17–18, already done on
the candidate side — the smallest remaining item.

**15 — Resume parser**
Not started. `POST /uploads/candidate` stores a file and returns a URL, and the
candidate detail holds Raw Resume / Linktal Resume URLs — but there is no
parsing endpoint and no auto-fill of contact details or employment history.
Needs new backend work (extraction + mapping), not just UI.

---

## Suggested order for the remainder

1. **14** — mirrors work already done on candidates; hours, not days.
2. **7** (empty state) — small API addition plus a list in the popover.
3. **12** — contained refactor of the Companies filter state into the URL.
4. **15** — new backend capability; size it before committing to a date.
5. **11** — largest and highest-risk, because it touches the scope resolver.

Two small decisions to put back to the client: whether the Outreach **Channel**
select should also go (item 18), and whether **Placed** should be manually
selectable on the Job Order status dropdown (item 6).
