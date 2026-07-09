# Manual vs Automated Workflows

## 1. Client Sourcing & Research
| Manual | Automated |
|--------|-----------|
| Search job boards (Seek, LinkedIn) manually | Job board scraping API |
| Copy-paste job details into system | One-click import from URL |
| Manually create Client when deal won | Convert Research → JobOrder one-click |
| Status stays "Prospect" forever | Auto-update to "Converted" |

## 2. Stakeholder Contact Tracking
| Manual | Automated |
|--------|-----------|
| Manually type notes after call | Call recording → AI transcription |
| Manually send email via Gmail | Send via system (SendGrid) |
| Manually log email sent | Auto-log all emails sent/received |
| Status unchanged after contact | Auto: `Stakeholder.status → Warm` |

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

| Table | Improvement |
|-------|-------------|
| ClientJobResearch | Add `convertedToJobOrderId` OR merge into JobOrder |
| JobOrder | Add `salaryMin`, `salaryMax`, `placedCount`, `replacementForPlacementId` |
| Placement | Add `guaranteeEndDate`, `isWithinGuarantee` |
| Client | Add `feePercentage` (number) alongside `feeSchedule` (text) |

## Summary: Auto-Update Triggers

| Trigger | Updates |
|---------|---------|
| ContactHistory created | `Stakeholder.status`, `Client.latestContactDate` |
| ScreeningHistory created | `Candidate.status → Warm` |
| Submission created | `JobOrder.latestSubmissionDate` |
| Interview scheduled | `Submission.status → Interviewing` |
| Placement created | `Candidate.status → Placed`, `JobOrder.status`, `feeValue` |
| Placement failed | Prompt replacement, link to failed placement |

---

## Auto-Update Rules (Detailed)

### Rule 1: Contact History Created
```
WHEN: StakeholderContactHistory created
THEN:
  → Stakeholder.status = 'Warm'
  → Stakeholder.lastContactDate = now()
  → Client.latestContactDate = now()
  → Client.latestContactBy = currentUser
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
