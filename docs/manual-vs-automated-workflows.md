# Manual vs Automated Workflows

> **Status: ROADMAP — mostly not yet implemented.** The only auto-update rule
> actually built so far is the **contact-tracking half of Rule 1** (see below);
> every other rule on this page — status auto-transitions, fee calculation,
> guarantee alerts, replacement linking, reporting — is still just this design
> doc, not running code. Treat the rest of this file as the target design, not
> a description of current behaviour.
>
> **Schema reality check** — some rules below assume fields that don't exist yet.
> Aligning the rule names to `schema.prisma`:
>
> | Rule mentions | Actual schema | Note |
> |---------------|---------------|------|
> | `Placement.feeValue` | `Placement.fee` | renamed |
> | `salaryOffered` | `Placement.salary` | renamed |
> | `JobOrder.placedCount` | `JobOrder.filledCount` | renamed |
> | `numberOfOpenings` | `JobOrder.openings` | renamed |
> | status `'Warm'`/`'Placed'` | enum `WARM`/`PLACED` | enums are upper-case |
> | `Placement.guaranteeEndDate` | ✅ exists | already in schema |
> | `Client.feePercentage`, `guaranteePeriod` | ✅ exist (numeric) | already in schema |
> | `JobOrder.salaryMin/Max` | ✅ exist | already in schema |
> | `Placement.isWithinGuarantee` / `guaranteeStatus` | ❌ missing | would need adding (use `Placement.status` FAILED/COMPLETED for now) |
> | `Client.latestContactBy` | ⚠️ partial | no field on `Client` itself — resolved live from whichever stakeholder's `StakeholderContactHistory` row is most recent (a company is never contacted directly) |
> | `Client.latestContactDate` | ✅ exists (as `Client.lastContactedAt`, denormalized) | bumped live by `POST /stakeholders/:id/contact-history`, only if newer than what's stored |
> | `Stakeholder.lastContactDate` | ✅ exists (as `Stakeholder.lastContactedAt`) | same live-bump mechanism |
> | `Candidate.contactedBy` | ✅ exists, but per-event not per-record — `CandidateContactHistory.contactedById` (mirrors the Stakeholder side) via `POST /candidates/:id/contact-history` | `Candidate.lastContactedAt` also now exists, same bump-if-newer rule |
> | `JobOrder.latestSubmissionDate`, `isReplacement`, `replacementForPlacementId` | ❌ missing | replacement-linking was explicitly deferred |
> | JobOrder → ClientJobResearch link | ❌ missing | no `jobResearchId` on JobOrder yet |

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
| Manual | Automated |
|--------|-----------|
| Manually create job order | One-click convert from Research |
| Manually track openings filled | Auto-count from Placements |
| Manually update status when filled | Auto: `JobOrder.status → Placed` |

## 6. Candidate Submission
| Manual | Automated |
|--------|-----------|
| Download resume, attach to email | One-click send with auto-attachment |
| Write email manually | Email templates with variables |
| Send via Gmail/Outlook | System sends via SendGrid/WhatsApp |
| Manually log email sent | Auto-logged in ContactHistory |
| Manually update submission status | Magic link - client clicks in email |

## 7. Interview Scheduling
| Manual | Automated |
|--------|-----------|
| Call client to schedule | Client self-schedules via booking link |
| Call candidate to confirm | Auto-send calendar invite |
| Manually enter interview date | Auto-populated from booking |
| Manually update status | Auto: `Submission.status → Interviewing` |

## 8. Placement & Fee
| Manual | Automated |
|--------|-----------|
| Manually calculate fee (salary × %) | Auto-calculate from Client.feePercentage |
| Manually update candidate status | Auto: `Candidate.status → Placed` |
| Manually update job order status | Auto: `JobOrder.status → Placed` |
| Manually update client status | Auto: `Client.status → Traded` |

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
| JobOrder | `latestSubmissionDate`, `isReplacement`, `replacementForPlacementId` | ❌ todo |
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
| Submission created | `JobOrder.latestSubmissionDate` | ❌ not built |
| Interview scheduled | `Submission.status → Interviewing` | ❌ not built |
| Placement created | `Candidate.status → Placed`, `JobOrder.status`, `feeValue` | ❌ not built |
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
```
WHEN: Interview scheduled (via booking link or manual)
THEN:
  → CandidateSubmission.status = 'Interviewing'
  → CandidateSubmission.interviewDate = bookedDate
  → Send calendar invite to Candidate + Stakeholder
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
```
WHEN: Placement created
THEN:
  → Placement.feeValue = salaryOffered × Client.feePercentage / 100
  → Placement.guaranteeEndDate = startDate + Client.guaranteePeriod
  → CandidateSubmission.status = 'Placed'
  → Candidate.status = 'Placed'
  → JobOrder.placedCount += 1

  IF JobOrder.placedCount >= JobOrder.numberOfOpenings:
    → JobOrder.status = 'Placed'

  IF Client has no prior placements:
    → Client.status = 'Traded'
```

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
