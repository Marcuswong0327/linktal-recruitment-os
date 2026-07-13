# Linktal Recruitment OS (Project Specifications)

Linktal Recruitment currently manages its entire recruitment desk — client acquisition, candidate sourcing, screening, submissions, interviews, placements and finance — across three interconnected Excel workbooks, email, and a set of third-party outreach tools. As of the current dataset, this covers 96 client companies, 132 stakeholder contacts, 105 candidates and 28 live job orders, managed by 14 consultants.

This workflow has served the business well, but it is held together by manual lookups between spreadsheets, hand-entered status updates, and information that lives in inboxes rather than in a shared system. As headcount, client volume and job order flow increase, this becomes harder to maintain, harder to report on, and increasingly exposed to data loss and inconsistency.

This proposal outlines the design and development of Version 1 (V1) of Linktal OS — a spreadsheet-native recruitment operating system that keeps the working style consultants already know, while replacing manual lookups with a genuinely connected data model. Every Company, Stakeholder, Job Order and Candidate is linked automatically, so information is entered once and stays consistent everywhere it appears.

## Data Model

Version 1 is built on the same three entity groups already in use today, re-implemented as a connected relational model rather than three separate spreadsheets stitched together with lookup formulas.

| Entity Group | Core Records                                                                                 | Current Volume                 |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------------ |
| Client DB    | Company Info, Stakeholders, Stakeholder Contact History, Job Opening Research                | 96 companies, 132 stakeholders |
| Job Orders   | Consultant Job Order records linked to Client & Candidates; salary, fee value, dates, status | 28 live job seekers            |
| Candidate DB | Candidate Basic Info, Screening History, Job Interviewing History                            | 105 candidates                 |

Relationships: Client → Job Order → Candidate. Today these are stitched together with Excel lookups; Linktal OS makes them real, enforced relationships, so every view — Company, Job Order or Candidate — reflects the same underlying record.

## Scope of Work

The proposed V1 scope is based on our current understanding of Linktal's most important operational bottlenecks and the workflows that should be stabilised first. If, during final review or discovery, Linktal feels that certain items should be deprioritised in favour of bringing other roadmap items forward, we are happy to discuss and re-balance the V1 scope accordingly. Rather than organising Version 1 around technical modules, the scope mirrors the recruitment lifecycle Linktal already follows — with the Job Order as the central record every recruitment engagement is built around.

- Workflow 1 - Authentication & User Management
  - Secure login
  - Role-based access control (RBAC) - Administrator, Manager, Consultant
  - User management
- Workflow 2 - Client Acquisition
  - Company search and creation
  - Stakeholder management and contact history
  - Outreach activity logging
  - Relationship status tracking (Cold/Warm/Traded/UNS)
  - Terms of Business (TOB) tracking
- Workflow 3 - Job Order Management
  - Create and manage Job Orders
  - Link to Company and assign Consultant
  - Hiring manager, requirements, salary range and industry
  - Job Order status and activity timeline
- Workflow 4 - Candidate Sourcing
  - Search the existing candidate database first
  - Manual candidate entry
  - Resume upload and parsing
  - Duplicate detection
- Workflow 5 - Candidate Management
  - Candidate profile, resume and employment history
  - Salary and notice period
  - Documents
  - Candidate activity timeline
- Workflow 6 - Candidate Screening
  - Screening status, availability and salary confirmation
  - Screening notes
- Workflow 7 - Candidate Submission
  - Submission tracking
  - Client feedback and shortlisting
- Workflow 8 - Interview Management
  - Manual tracking of interview scheduling, stages, and outcomes
  - Communication log
  - _Calendar sync and automated invites are deffered to Version 2_
- Workflow 9 - Dynamic Requirement Workspace
  - Create custom spreadsheet-style views
  - Configure and add entity-based columns
  - Sort, filter, and save personalized views
  - Automatic entity linking behind the scenes
  - Entity detail drawer on any record
- Workflow 10 - Consultant Workspace
  - Company, Candidate, and Job Order pipelines
  - Search, filters and bulk actions
  - Notes and activity history
- Workflow 11 - Offer & Placement
  - Offer & Placement from per Job Order - Offer Details, Candidate Acceptance, Commencement, and Commerical & Billing
  - Placed Candidate chip and Placement Status badge on the Job Order row (e.g. Not Created / Offer Created / Awaiting Acceptance / Placement Complete )
  - Record commencement date, salary offered, fee value and invoice contact
  - Generate an Accounts Handof record once a placement in marked complete
  - Accounts Handoff view, a read-focused workspace for Finance to see and manage placements ready for invoicing

## Deliverables

- Production-ready web application
- Database design and implementation
- Backend APIs
- Deployment to production (incl. infrastructure setup)
- Source Code
- Basic technical documentation
- User Acceptance Testing (UAT) support
- Knowledge transfer session

## Timeline

The 8-week timeline is organised into four two-week phases that follow the
recruitment lifecycle and its natural dependency chain
(**Client → Job Order → Candidate**). Each week ends in a demoable milestone so
progress can be reviewed with the project manager on a weekly cadence.

> **Delivery risks to watch:** Resume parsing (Week 4) and the Dynamic
> Requirement Workspace (Week 7) are the two highest-complexity items. The
> workspace is effectively a configurable spreadsheet engine and is the first
> candidate for a "V1-lite" scope if time gets tight. Weeks 5–6 are the densest
> (four workflows); if screening/submission slips, offer & placement is the
> natural item to push.

### Phase 1 — Foundation & Client DB (Weeks 1–2)

**Week 1 — Authentication, RBAC & data model (Workflow 1)**

- [x] Secure login, role-based access control (Admin / Manager / Consultant), user management
- [x] Full relational schema for all entities (Company, Stakeholder, Job Order, Candidate + relationships), migrated
- [x] Seed the database from the existing Excel export (96 companies, 132 stakeholders, 105 candidates, 28 job orders)
- [x] Client Demo: Log in as each role and see a role-gated app skeleton; Show the database populated with real Linktal data.

**Week 2 — Client Acquisition (Workflow 2)**

- [ ] Company search and creation; stakeholder management and contact history
- [ ] Outreach activity logging, relationship status tracking (Cold/Warm/Traded/UNS), Terms of Business (TOB) tracking
- [ ] Client Demo: Search a real company, Open the stakeholders list, Log an outreach touch, Change the relationship status.

### Phase 2 — Job Orders & Candidates (Weeks 3–4)

**Week 3 — Job Order Management (Workflow 3)**

- [ ] Create and manage Job Orders; link to Company and assign Consultant
- [ ] Hiring manager, requirements, salary range, industry; Job Order status and activity timeline
- [ ] **Client Demo**: Create a live Job Order against a real client, assign a consultant, walk through the activity timeline.

**Week 4 — Candidate Sourcing & Management (Workflows 4 & 5)**

- [ ] Search existing candidate DB first, manual entry, resume upload and parsing, duplicate detection
- [ ] Candidate profile, resume and employment history, salary and notice period, documents, activity timeline
- [ ] **Client Demo**: Search candidates, Add a new one, Upload Resume and watch it parse into Structured Fields

### Phase 3 — Recruitment Pipeline (Weeks 5–6)

**Week 5 — Screening & Submission (Workflows 6 & 7)**

- [ ] Screening status, availability and salary confirmation, screening notes
- [ ] Submission tracking, client feedback and shortlisting
- [ ] **Client Demo**: Screen a Candidate, Submit them to a Job Order, Record Client Feedback

**Week 6 — Interviews & Offer/Placement (Workflows 8 & 11)**

- [ ] Interview scheduling, stages and outcomes; communication log (calendar sync deferred to V2)
- [ ] Offer details → candidate acceptance → commencement → commercial & billing; placement status badges; Accounts Handoff view
- [ ] **Client Demo**: Carry one candidate end-to-end — interview → offer → placement complete → generated Accounts Handoff record

### Phase 4 — Workspaces, Hardening & Launch (Weeks 7–8)

**Week 7 — Workspaces (Workflows 9 & 10)**

- [ ] Consultant Workspace: Company / Candidate / Job Order pipelines, search, filters, bulk actions, notes and activity history
- [ ] Dynamic Requirement Workspace: configurable spreadsheet-style views, entity-based columns, sort/filter/save, entity detail drawer
- [ ] **Client Demo**: Build and Save a Custom View, Opens the Entity detail drawer on any record

**Week 8 — Hardening, UAT & handover**

- [ ] Bug bash and QA, production deployment and infrastructure setup, basic technical documentation
- [ ] User Acceptance Testing (UAT) support and knowledge transfer session
- [ ] **Client Demo**: The live production application plus a UAT walkthrough.
