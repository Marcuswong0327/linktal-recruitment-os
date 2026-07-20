# Manual vs Automated Workflows

> **Status: mostly roadmap, but the Job Orders pipeline (Rules 1, 4-partial, and
> 6) is now real, running code** — see [Job Orders Pipeline — How It Works
> Today](#job-orders-pipeline--how-it-works-today) for the actual walkthrough.
> Everything else on this page — guarantee alerts, replacement linking,
> reporting, auto-close, client cold/warm progression — is still just this
> design doc, not running code. Treat the rest of this file as the target
> design, not a description of current behaviour.
>
> **Schema reality check** — some rules below assume fields that don't exist yet.
> Aligning the rule names to `schema.prisma`:
>
> | Rule mentions | Actual schema | Note |
> |---------------|---------------|------|
> | `Placement.feeValue` | ✅ exists for real | renamed from `Placement.fee` 2026-07-20 |
> | `salaryOffered` | `Placement.baseSalary` | renamed from `Placement.salary` 2026-07-20 |
> | `Placement.superPercentage`, `totalPackage`, `feeType` (PERCENTAGE/FLAT), `accountsNotified` | ✅ all exist | added 2026-07-20 to match CLAUDE.md's confirmed fee-calc fields |
> | `JobOrder.placedCount` | `JobOrder.filledCount` | renamed |
> | `numberOfOpenings` | `JobOrder.openings` | renamed |
> | status `'Warm'`/`'Placed'` | enum `WARM`/`PLACED` | enums are upper-case |
> | `Placement.guaranteeEndDate` | ✅ exists, auto-calculated on `Placement` create | already in schema |
> | `Client.feePercentage`, `guaranteePeriod` | ✅ exist (numeric) | already in schema |
> | `JobOrder.salaryMin/Max` | ✅ exist | already in schema |
> | `JobOrder.location` | `JobOrder.city` + `JobOrder.suburb` | renamed/split 2026-07-20 to match the Job Orders Portfolio mockup |
> | `JobOrder.isReplacement` | ✅ exists (flag only) | added 2026-07-20; **no** `replacementForPlacementId` link — still deferred, see below |
> | `JobOrder.isCollaborated` | ✅ exists (flag only) | added 2026-07-20, not in the original rule set below — marks a split-desk job order, no multi-owner linking |
> | `JobOrder.quality` | ✅ exists | added 2026-07-20 — subjective quality of the job order/posting, `LOW`/`MEDIUM`/`HIGH` |
> | Interview scheduling / rounds | ✅ `Interview` model exists | added 2026-07-20 — `roundLabel`/`interviewDate`/`outcome` per submission, see Rule 4 below |
> | `Placement.isWithinGuarantee` / `guaranteeStatus` | ❌ missing | would need adding (use `Placement.status` FAILED/COMPLETED for now) |
> | `Client.latestContactBy` | ⚠️ partial | no field on `Client` itself — resolved live from whichever stakeholder's `StakeholderContactHistory` row is most recent (a company is never contacted directly) |
> | `Client.latestContactDate` | ✅ exists (as `Client.lastContactedAt`, denormalized) | bumped live by `POST /stakeholders/:id/contact-history`, only if newer than what's stored |
> | `Stakeholder.lastContactDate` | ✅ exists (as `Stakeholder.lastContactedAt`) | same live-bump mechanism |
> | `Candidate.contactedBy` | ✅ exists, but per-event not per-record — `CandidateContactHistory.contactedById` (mirrors the Stakeholder side) via `POST /candidates/:id/contact-history` | `Candidate.lastContactedAt` also now exists, same bump-if-newer rule |
> | `JobOrder.latestSubmissionDate`, `replacementForPlacementId` | ❌ missing | replacement-linking was explicitly deferred; "latest submission date" is computed live in the Job Orders sheet from `CandidateSubmission.submittedAt`, not stored as its own column |
> | JobOrder → ClientJobResearch link | ❌ missing | no `jobResearchId` on JobOrder yet |

## Job Orders Pipeline — How It Works Today

A step-by-step walkthrough of the actual UI/API, for whoever picks this up
next. All of this is real, running code (`apps/web/src/features/job-orders/`,
`apps/api/src/{job-orders,submissions,interviews,placements}`).

### The main sheet (`/job-orders`)

- One row per job order. **Consultants see only their own book**
  (`consultantId = caller`); manager/finance/researcher/admin see everyone's.
- Status/Quality/Priority/Consultant show as **read-only badges** — nothing on
  this sheet is directly editable except via the **Candidates** column and the
  toolbar's bulk actions (multi-select rows → set status/quality/priority/
  consultant across several at once). Everything else (role details,
  description, city/suburb, Replacement/Collaborated flags) is edited on the
  row's own dedicated page (click anywhere on the row to open it).
- The **Candidates** column is the roster: click it to open a searchable
  multi-select — checking a candidate creates a `CandidateSubmission`
  (`SUBMITTED`), unchecking soft-deletes it. Right next to it, a small icon
  opens the **pipeline panel**.

### The pipeline panel (drag-and-drop)

Opened via the icon in the Candidates column. Three columns —
**Submissions → Interviewing → Placed** (plus a read-only Rejected lane) —
built with `@dnd-kit/core`. What a drag actually does depends on the target:

- **Drag into Submissions or Interviewing** → immediately calls
  `PATCH /candidate-submissions/:id { status }`. No form, no confirmation.
- **Click a candidate's name while they're in Interviewing** → opens that
  submission's **interview rounds** view: add a round (label, date, outcome),
  see past rounds, change a round's outcome inline, delete a round. This is
  metadata only — it does not itself move the candidate's stage.
- **Drag into Placed** → does **not** just flip status. It opens the real
  **Placement form** (base salary, super % — default 12, fee type/percentage
  or a flat fee, start date, accounts-notified). Cancelling the form leaves
  everything untouched (the drag is effectively undone). Submitting it calls
  `POST /placements`, which — in one write — creates the `Placement` record
  (with auto-calculated `totalPackage`/`feeValue`/`guaranteeEndDate`) **and**
  flips the submission to `PLACED`, the candidate to `PLACED`, increments the
  job order's `filledCount` (flipping the job order to `PLACED` once fully
  filled), and flips the client to `TRADED` on their first-ever placement —
  see Rule 6 below for the exact logic and its known gaps (no over-fill guard,
  no edit-after-create UI).

### The dedicated page (`/job-orders/[id]`)

Full guided edit form (Role/Client/Consultant/Department/City/Suburb/Quality/
Status/Priority/Replacement/Collaborated, Compensation, Description), plus the
Submissions card (view/add/remove candidates, change stage via a plain
dropdown — an older, simpler alternative to the pipeline panel's drag) and the
Pipeline History card (every stage-change event, from the audit log).
`/job-orders/new` is the same layout in create mode.

## 1. Client Sourcing & Research
| Manual | Automated |
|--------|-----------|
| Search job boards (Seek, LinkedIn) manually | Job board scraping API |
| Copy-paste job details into system | One-click import from URL |
| Manually create Client when deal won | Convert Research → JobOrder one-click |
| Status stays "Prospect" forever | Auto-update to "Converted" |

## 2. Stakeholder Contact Tracking
> ✅ **Partially built**: `POST /stakeholders/:id/contact-history` — a consultant
> manually logs a contact (method, notes, optional backdated time) via the
> Stakeholder Enrichment Workspace; the API stamps `contactedById` from the
> session and bumps `Stakeholder.lastContactedAt` / `Client.lastContactedAt`
> (only if newer). Same feature exists for candidates
> (`POST /candidates/:id/contact-history`), from the candidate detail page and
> the candidates list. What's still manual/automated below is unchanged by this
> — it's still the consultant typing the log entry, not an AI transcript or an
> auto-detected email/call.

| Manual | Automated |
|--------|-----------|
| Manually type notes after call | Call recording → AI transcription |
| Manually send email via Gmail | Send via system (SendGrid) |
| Manually log a contact (method + notes) — see above | Auto-log all emails sent/received |
| Status unchanged after contact | Auto: `Stakeholder.status → Warm` — **still not built** |

## 3. Candidate Sourcing
| Manual | Automated |
|--------|-----------|
| Copy-paste candidate info (15+ columns) | Resume parser - PDF → auto-fill |
| Manually type work history | Extract from resume automatically |
| Manually enter LinkedIn URL | Browser extension - one-click import |

## 4. Candidate Screening
| Manual | Automated |
|--------|-----------|
| Manually type screening notes | Call recording → AI summary |
| Manually update candidate status | Auto: `Candidate.status → Warm` |
| Manually enter salary expectations | AI extract from transcript |

## 5. Job Order Management
> ✅ **Built**: consultants get a dedicated `/job-orders/new` guided create page
> (Client/Consultant/Quality/Status/Priority/Compensation/Description). Filled
> count and status auto-update from Placements (see Rule 6) — no manual
> tracking needed once a placement is created.

| Manual | Automated |
|--------|-----------|
| Manually create job order | ✅ dedicated create page — **not** one-click from Research (see below) |
| One-click convert from Research | ❌ not built — `ClientJobResearch` has no link to `JobOrder` yet |
| Manually track openings filled | ✅ `JobOrder.filledCount` auto-increments when a Placement is created |
| Manually update status when filled | ✅ Auto: `JobOrder.status → Placed` once `filledCount >= openings` |

## 6. Candidate Submission
| Manual | Automated |
|--------|-----------|
| Download resume, attach to email | One-click send with auto-attachment |
| Write email manually | Email templates with variables |
| Send via Gmail/Outlook | System sends via SendGrid/WhatsApp |
| Manually log email sent | Auto-logged in ContactHistory |
| Manually update submission status | Magic link - client clicks in email |

## 7. Interview Scheduling
> ⚠️ **Partially built**: interview *rounds* (label, date, outcome) are a real,
> trackable sub-resource of a submission (`Interview` model, `/interviews`
> endpoint) — a consultant opens the pipeline panel's Interviewing column,
> clicks a candidate, and logs each round manually. What's still fully manual
> below is everything about *getting* that date (no booking link, no
> calendar invite) and the stage transition itself (moving a candidate into
> Interviewing is a drag in the pipeline panel, not auto-triggered by
> scheduling a round).

| Manual | Automated |
|--------|-----------|
| Call client to schedule | Client self-schedules via booking link — ❌ not built |
| Call candidate to confirm | Auto-send calendar invite — ❌ not built |
| Manually enter interview date | ✅ tracked per round (`Interview.interviewDate`), still manually entered — not auto-populated from a booking |
| Manually update status | Moving to Interviewing is a manual drag in the pipeline panel — not auto-triggered by adding an interview round |

## 8. Placement & Fee
> ✅ **Built** — see Rule 6 and the
> [walkthrough](#job-orders-pipeline--how-it-works-today) below. Dragging a
> candidate to "Placed" in the pipeline panel opens the real placement form;
> submitting it does everything in the right column below in one write.

| Manual | Automated |
|--------|-----------|
| Manually calculate fee (salary × %) | ✅ Auto-calculate: `baseSalary × (1 + superPercentage/100) = totalPackage`, `totalPackage × feePercentage/100 = feeValue` (or a directly-entered flat `feeValue`) |
| Manually update candidate status | ✅ Auto: `Candidate.status → Placed` |
| Manually update job order status | ✅ Auto: `JobOrder.filledCount += 1`, `JobOrder.status → Placed` once fully filled |
| Manually update client status | ✅ Auto: `Client.status → Traded` on the client's first-ever placement |
| Manually calculate guarantee end date | ✅ Auto: `Placement.guaranteeEndDate = startDate + Client.guaranteePeriod` |

## 9. Guarantee Tracking
| Manual | Automated |
|--------|-----------|
| No tracking of guarantee expiry | Auto-calculate guaranteeEndDate |
| No alerts when guarantee expires | Cron job - alert 1 week before |
| Manually create replacement job order | Prompt + auto-link to failed Placement |
| Manually set fee to $0 | Auto-set if isReplacement = true |

## 10. Reporting
| Manual | Automated |
|--------|-----------|
| Export to Excel for reports | Dashboard with real-time metrics |
| Manually count placements | Auto-aggregated per consultant |
| Manually calculate revenue | Sum of feeValue |
| No pipeline visibility | Kanban view of submissions |

---

## Summary: Tables to Link/Improve

| Table | Improvement | Status |
|-------|-------------|--------|
| JobOrder | `salaryMin`, `salaryMax` | ✅ done |
| JobOrder | `placedCount` | ✅ done (as `filledCount`) |
| Placement | `guaranteeEndDate` | ✅ done |
| Client | `feePercentage` (numeric), `guaranteePeriod` (numeric) | ✅ done |
| ClientJobResearch → JobOrder | link (`jobResearchId` on JobOrder) | ❌ todo |
| JobOrder | `isReplacement`, `isCollaborated` (flags only) | ✅ done — no `replacementForPlacementId` link, per the confirmed "treat as new job" decision |
| JobOrder | `latestSubmissionDate` (stored column) | ❌ todo — currently computed live in the UI from `CandidateSubmission.submittedAt`, not stored |
| JobOrder | `city`/`suburb` (replaces `location`), `quality` | ✅ done |
| Interview | round tracking (`roundLabel`, `interviewDate`, `outcome`) | ✅ done — no auto-trigger from a booking link/calendar invite |
| Placement | `superPercentage`, `totalPackage`, `feeType`, `accountsNotified` | ✅ done |
| Placement | `isWithinGuarantee` (or derive from `status` + `guaranteeEndDate`) | ❌ todo |
| Contact ownership | `contactedBy` fields | ✅ done — `StakeholderContactHistory.contactedById` and `CandidateContactHistory.contactedById` (both nullable FK → `Consultant`, set from the caller's session, never the request body) |
| Candidate ownership | owning consultant (mirrors `Client.consultantId`) | ✅ done — `Candidate.consultantId` |
| Stakeholder categorization | fixed job-title categories for filtering | ✅ done — `StakeholderRoleType` reference table + `Stakeholder.roleTypeId`, auto-derived from `jobTitle` by keyword match, independently editable |
| Candidate categorization | fixed industry/role-type/specialization categories for filtering | ✅ done — `Candidate.industryId` (shared `Industry` catalog with Client), `Candidate.roleTypeId` (own `CandidateRoleType` catalog — employment type, not auto-derived), specializations many-to-many via `CandidateSpecialization` (shared `Specialization` catalog with Client) |
| Client lead quality | subjective recruiter rating, sortable | ✅ done — `Client.quality` (`LOW`/`MEDIUM`/`HIGH`) |

## Summary: Audit & History Tracking

> ✅ **Built** — full write history for the core entities, via one generic
> mechanism rather than per-feature tracking. Details, schema, and endpoints:
> see `database-erd.md` → "Audit & History Tracking". Short version:

| Requirement | Status |
|---|---|
| Who/when/which record/field/before/after/source, for every audited write | ✅ done — generic `AuditLog`, no per-feature code needed |
| Candidate notes: content/author/created/editor/edited-at/edit history | ✅ done — same JSONB timeline shape as `Client.notes` |
| Audit coverage: Candidates, notes, Stakeholders, Companies, Job Orders, Submissions, interview stages, Placements, contact activities, Last Contacted, status changes | ✅ done — all in `AUDITED_MODELS`; contact activities are their own append-only tables; Last Contacted is the live bump-if-newer mechanism above |
| Pipeline stage-change events (candidate ↔ job order, incl. moved back / removed) | ✅ done — `GET /candidates/:id/pipeline-timeline`, `GET /job-orders/:id/pipeline-timeline`, rendered as the "Pipeline history" card |
| Org-wide Last Contacted (not scoped to current viewer) | ✅ done — see Rule 1 below |
| Automatic user attribution (never manually self-selected) | ✅ done — `contactedById`/note `by`/`editedBy` always come from the session, never the request body |
| Free-text "reason" on ordinary edits | ❌ deferred — no current flow has a meaningful "why" to attach |
| Explicit "imported/system-generated" flag on historical contact rows | ❌ deferred — imported rows have `contactedById: null`, same as "unattributed" |

## Summary: Auto-Update Triggers

| Trigger | Updates | Status |
|---------|---------|--------|
| ContactHistory created (Stakeholder or Candidate) | `[Stakeholder\|Candidate].lastContactedAt`, and `Client.lastContactedAt` for the stakeholder side (bump-if-newer only) | ✅ done |
| ContactHistory created | `Stakeholder.status → Warm` | ❌ not built |
| ScreeningHistory created | `Candidate.status → Warm` | ❌ not built |
| Submission created | `JobOrder.latestSubmissionDate` | ❌ not built (computed live in the UI instead, see above) |
| Interview scheduled | `Submission.status → Interviewing` | ❌ not built — interview rounds are tracked (✅), but the stage move itself is still a manual drag |
| Placement created | `Candidate.status → Placed`, `JobOrder.filledCount`/`status`, `Client.status`, `feeValue`/`totalPackage`/`guaranteeEndDate` | ✅ **built** — `PlacementsService.create`, see Rule 6 |
| Placement failed | Prompt replacement, link to failed placement | ❌ not built |

---

## Auto-Update Rules (Detailed)

### Rule 1: Contact History Created

> ✅ **The timestamp/attribution half is built** (`StakeholdersService.addContactHistory`,
> `CandidatesService.addContactHistory`). ❌ **The status transition is not.**

```
WHEN: StakeholderContactHistory created                    ✅ done — POST /stakeholders/:id/contact-history
THEN:
  → Stakeholder.status = 'Warm'                             ❌ not built
  → Stakeholder.lastContactedAt = contactedAt                ✅ done — only if newer than what's stored
  → Client.lastContactedAt = contactedAt                     ✅ done — same bump-if-newer rule, cascaded from the stakeholder
  → StakeholderContactHistory.contactedById = currentUser    ✅ done — always the caller's session, never request-supplied

WHEN: CandidateContactHistory created                       ✅ done — POST /candidates/:id/contact-history (mirrors the above)
THEN:
  → Candidate.lastContactedAt = contactedAt                  ✅ done — only if newer than what's stored
  → CandidateContactHistory.contactedById = currentUser      ✅ done
```

### Rule 2: Screening History Created
```
WHEN: CandidateScreeningHistory created
THEN:
  → Candidate.status = 'Warm'
  → Candidate.updatedAt = now()
  → Candidate.contactedBy = currentUser
```

### Rule 3: Submission Created
```
WHEN: CandidateSubmission created
THEN:
  → JobOrder.latestSubmissionDate = now()
  → Send email/WhatsApp to Stakeholder with resume
  → Log in StakeholderContactHistory
```

### Rule 4: Interview Scheduled

> ⚠️ **Round tracking is built; the automation isn't.** A consultant manually
> logs each round (`POST /interviews` — `submissionId`, `roundLabel`,
> `interviewDate`, `outcome`) from the pipeline panel. There's no booking
> link, no auto-sent calendar invite, and adding a round does **not** itself
> flip `CandidateSubmission.status` — moving a candidate into the
> Interviewing column is still a separate manual drag.

```
WHEN: Interview scheduled (via booking link or manual)          ⚠️ manual only — no booking link
THEN:
  → CandidateSubmission.status = 'Interviewing'                 ❌ not auto-triggered — separate manual drag
  → Interview round created (roundLabel, interviewDate, outcome) ✅ done — POST /interviews
  → Send calendar invite to Candidate + Stakeholder              ❌ not built
```

### Rule 5: Client Response (Magic Link)
```
WHEN: Client clicks [Schedule Interview] in email/WhatsApp
THEN:
  → CandidateSubmission.status = 'Interviewing'
  → Redirect to booking page

WHEN: Client clicks [Reject] in email/WhatsApp
THEN:
  → CandidateSubmission.status = 'Rejected'
  → Prompt for rejection reason
```

### Rule 6: Placement Created

> ✅ **Built** — `PlacementsService.create` (`POST /placements`), triggered
> from the pipeline panel's "drag to Placed" flow (see the
> [walkthrough](#job-orders-pipeline--how-it-works-today)). One difference
> from the original design below: the fee is calculated from the
> **consultant-entered `baseSalary`/`superPercentage`/`feePercentage`** on the
> placement itself (or a flat `feeValue`), not directly from
> `Client.feePercentage` — the client's fee percentage is the agreed default,
> but the actual placement can override it per-deal. All financial fields are
> optional: placing a candidate with everything left blank still creates the
> `Placement` row and still runs every status update below.

```
WHEN: Placement created                                                          ✅ done
THEN:
  → Placement.totalPackage = baseSalary × (1 + superPercentage / 100)            ✅ done (superPercentage defaults to 12)
  → Placement.feeValue = totalPackage × feePercentage / 100                      ✅ done (feeType = PERCENTAGE; a feeType = FLAT placement uses the entered feeValue directly)
  → Placement.guaranteeEndDate = startDate + Client.guaranteePeriod              ✅ done
  → CandidateSubmission.status = 'Placed'                                        ✅ done
  → Candidate.status = 'Placed'                                                  ✅ done
  → JobOrder.filledCount += 1                                                    ✅ done

  IF JobOrder.filledCount >= JobOrder.openings:
    → JobOrder.status = 'Placed'                                                 ✅ done

  IF Client has no prior placements:
    → Client.status = 'Traded'                                                   ✅ done
```

**Known gaps** (not enforced today — flag if these matter for your use case):
- No check that `JobOrder.filledCount` doesn't exceed `JobOrder.openings` — a
  consultant can still create a second placement against an already-fully-filled
  job order (e.g. `openings: 1`); `filledCount` will just read `2`.
- No UI to **edit** a placement after creation (e.g. to fill in salary/fee
  that was left blank, or correct a typo) — only `POST /placements` (create)
  has a form; `PATCH /placements/:id` exists in the API but nothing in the web
  app calls it yet.

### Rule 7: Placement Failed (Within Guarantee)
```
WHEN: Placement.status = 'Failed' AND today < guaranteeEndDate
THEN:
  → Placement.isWithinGuarantee = true
  → Alert: "Candidate left within guarantee period"
  → Prompt: "Create replacement job order?"

  IF user confirms:
    → Create new JobOrder
    → JobOrder.isReplacement = true
    → JobOrder.replacementForPlacementId = failedPlacement.id
    → JobOrder.feeValue = 0 (free replacement)
```

### Rule 8: Guarantee Expiry Alert
```
WHEN: Cron job runs daily
FOR EACH: Placement WHERE status = 'Active'
  IF guaranteeEndDate - today <= 7 days:
    → Send alert to Consultant
    → Show in dashboard "At Risk" section

  IF guaranteeEndDate < today:
    → Placement.guaranteeStatus = 'Completed'
    → Remove from "At Risk"
```

### Rule 9: Job Order Auto-Close
```
WHEN: JobOrder.status = 'Active' AND no activity for 90 days
THEN:
  → Send reminder to Consultant
  → Prompt: "Close this job order?"

  IF no response in 7 days:
    → JobOrder.status = 'On Hold'
```

### Rule 10: Client Status Progression
```
Client.status logic:
  'Cold'   → No contact in 30+ days
  'Warm'   → Recent contact, no placement yet
  'Traded' → Has at least 1 successful placement

WHEN: No ContactHistory for 30 days
THEN:
  → Client.status = 'Cold'
  → Alert Consultant: "Client going cold"
```
