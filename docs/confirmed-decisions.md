# Confirmed Decisions

## 1. Client Job Opening Research vs Job Order

**Decision:** Keep separate

```
Client Company (1) ──→ (N) Client Job Opening Research
Client Company (1) ──→ (N) Job Order
Job Order (N) ──→ (0..1) Client Job Opening Research (optional link)
```

- Job Order can be created WITHOUT referencing Research
- Job Order can OPTIONALLY link to a Research record
- Research remains a historical/prospecting record

**Use Cases:**
- Search similar job openings across many companies
- Search a specific company's historical job openings

---

## 2. Salary Range in Job Order

**Decision:** Include as optional fields

| Field | Type | Required |
|-------|------|----------|
| salaryMin | Decimal | No |
| salaryMax | Decimal | No |

- Backend: Store for future reporting/analysis
- Frontend: Optional field, not required

---

## 3. Replacement Job Order Linking

**Decision:** No complex linking for now

- Replacement jobs treated as new job orders
- Difference is only on invoicing/finance side
- No need for `replacementForPlacementId` field
- Can revisit if clear benefit identified

---

## 4. Custom Values for Fields

**Decision:** Allow custom input

Fields that accept custom values (not fixed dropdowns):
- Industry
- Current Position
- Role Type
- Specialization
- Similar classification fields

**Implementation:** Autocomplete with suggestions + free text input

---

## 5. Placement Fee Structure

**Decision:** Percentage-based with manual override

**Standard Calculation:**
```
Base Salary:        $100,000
Superannuation:     12%
─────────────────────────────
Total Package:      $112,000
Fee Percentage:     15%
─────────────────────────────
Fee:                $16,800 + GST
```

**System Features:**
- Auto-calculate fee from: `totalPackage × feePercentage`
- Allow manual override for flat fee or custom arrangements
- Fee calculator UI with breakdown

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| baseSalary | Decimal | Base salary offered |
| superPercentage | Decimal | Default 12% |
| totalPackage | Decimal | Auto-calculated or manual |
| feePercentage | Decimal | e.g., 15 |
| feeValue | Decimal | Auto-calculated or manual override |
| feeType | Enum | 'percentage' or 'flat' |

---

## 6. Role-Based Access Control

**Decision:** 6 roles confirmed

| Role | Description |
|------|-------------|
| Admin | Full system access, manage users |
| Manager | View all data, reports, manage team |
| Consultant | Full workflow access (CRUD own data) |
| Finance | View placements, fees, invoices |
| Researcher | Research + upload only (limited workflow) |
| Viewer | Read-only access (optional) |

**Researcher Permissions:**
| Can Do | Cannot Do |
|--------|-----------|
| Search client/company info | Enter screening call notes |
| Find job titles & hiring info | Manage job order workflow |
| Upload company information | Access sensitive candidate data |
| Upload candidate profiles | Create placements |
| Upload resumes | Financial data |

---

## 7. Guarantee Period

**Decision:** 90 days (based on Terms of Business)

| Field | Value |
|-------|-------|
| Default guarantee period | 90 days |
| Stored on | Client (can vary per client) |

---

## 8. Guarantee Period Start Date

**Decision:** Starts from candidate's actual start date

```
Candidate Start Date = Invoice Date = Placement Date
                     ↓
              Guarantee Period Begins
                     ↓
              90 days later
                     ↓
              Guarantee Ends
```

**Not tracked (for now):**
- Offer date
- Contract signing date

**Fields:**
| Field | Description |
|-------|-------------|
| startDate | Candidate's first day of work |
| guaranteeEndDate | Auto: startDate + guaranteePeriod |
| invoiceDate | Same as startDate |

---

---

## 9. Data Import

**Decision:** Import as-is, no cleanup

- Import raw data from Excel without pre-cleaning
- Handle duplicates during import (assign new ID if duplicate found)
- Duplicate found: CDD-0104 (two different people - Tony Ju vs Tony John)

---

## 10. Authentication

**Decision:** Better Auth with Neon

- No `passwordHash` column on User table
- Auth handled by Better Auth / Neon Auth
- User table has `authId` field linking to Better Auth

---

## 11. MVP Scope

**Decision:** Excel Import + RBAC first

Phase 1:
1. Finalize Prisma schema
2. Run migrations
3. Seed RBAC (Roles + Permissions)
4. Import Excel data (Clients, Candidates, Job Orders)

---

## 12. Auto-Updates

**Decision:** Implement all 17 service-level auto-updates

See `docs/manual-vs-automated-workflows.md` for full list.

---

## Summary of Schema Changes

### JobOrder Table
```diff
+ clientJobResearchId  String?   @relation (optional)
+ salaryMin            Decimal?
+ salaryMax            Decimal?
```

### Placement Table
```diff
+ baseSalary           Decimal
+ superPercentage      Decimal   @default(12)
+ totalPackage         Decimal
+ feePercentage        Decimal
+ feeValue             Decimal
+ feeType              Enum      ('percentage', 'flat')
+ startDate            DateTime
+ guaranteeEndDate     DateTime  (auto-calculated)
+ invoiceDate          DateTime  (same as startDate)
```

### Role Table
```diff
+ 'researcher' role added
```

### Industry, Position, RoleType, Specialization
```
Allow free text input with autocomplete suggestions
(No enum restriction)
```
