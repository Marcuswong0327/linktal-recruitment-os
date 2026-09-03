# Workbook import — known discrepancies

Everything the importer found in the source workbook that it could not resolve
cleanly, with what it does about each. Written 2026-08-02 against
`scripts/import-workbook.ts` and the live Google-Sheet export
(`apps/api/data/linktal-workbook.xlsx`).

Nothing here is an import *failure*. The importer's rule is **reject, never
guess** — an unknown value is skipped and reported rather than silently coerced
into a near-match — so each item below is either data the sheet doesn't contain,
or data that needs a human decision.

Machine-readable companion: `apps/api/data/import-workbook-rejects.csv`,
regenerated on every run.

**Severity key** — 🔴 loses records · 🟡 loses a field · 🟢 cosmetic or handled

---

## 1. Source data quality

### 🟡 1.1 ~38 duplicate client companies

34 company names cover 72 rows in the `Client(Company)` tab, so those companies
now exist as separate `Client` records.

| Kind | Example |
|---|---|
| Case variant | `CMI Electrical` / `CMI electrical` |
| Legal-suffix variant | `Capral` / `Capral Limited` |
| Straight duplicate | `Bega Group` twice |
| Triple | `Bakers Maison Australia` ×3 |

Every group sits in one industry, so they are genuinely the same company.

**Importer behaviour:** stakeholders/TOBs attach to the **earliest** row
(lowest `displayId`), deterministically. All 34 groups are listed with their
`displayId`s in the reject CSV.

**Decision needed:** merge them, and pick which record wins. Not done
automatically — choosing a survivor changes which contacts, TOBs and job orders
hang off which company.

### 🔴 1.2 One stakeholder company doesn't exist

`Multipackljm` (stakeholders row 3589) matches no client. 1 contact skipped out
of 6,452. Looks like a typo in the sheet.

### 🟢 1.3 Inconsistent industry spelling across tabs

The clients tab writes `Banking; Financial Services`; the candidates tab writes
`Banking Financial Services`. The taxonomy has the latter.

**Importer behaviour:** handled by an explicit `INDUSTRY_ALIASES` entry. Listed
explicitly rather than stripping punctuation generally, so a genuinely unknown
industry still rejects.

### 🟢 1.4 Candidate status case variants

`Warm` (915 rows) and `warm` (623 rows) both appear. Case-sensitive matching
would have silently dropped 623 candidates to COLD.

**Importer behaviour:** matched case-insensitively.

### 🟡 1.5 Consultant name spelled differently in the TOB tab

`Zhaohao Teoh` in `Client (TOB Details)`; the consultant record is
`Zhao Hao Teoh`. Will fail to match without an alias.

**Status:** not yet handled — the TOB tab isn't imported yet.

### 🟢 1.6 Date typos

`7st Jan 2026` (3 rows), `23th July 2026`. Already handled — `parseDate` in
`scripts/workbook.ts` strips malformed ordinal suffixes.

### 🟢 1.7 Annotation rows mixed into data tabs

`Linktal JobOrder` has rows whose Consultant is `Joe's questions` or `1`, and
whose City is `since consultant can only see …`. The `User List` tab has the
same pattern (already handled by `import-users.ts`, which is why 17 sheet rows
produced 13 consultants).

**Status:** to handle when the job-orders tab is imported.

---

## 2. Catalog gaps

### 🔴 2.1 The candidate specialization vocabulary is not in the taxonomy

The single biggest gap. Of 1,095 candidate rows carrying a specialization:

| | Rows |
|---|---|
| Match the taxonomy exactly | 205 |
| Match only after punctuation-normalising | 22 |
| **No match at all** | **868** (497 distinct values) |

Unmatched values look like `Project manager, remedial, NSW`, `CA, class 2, NSW`,
`Site supervisor, civil, NSW` — a role+sector+state vocabulary the 774-row
`Specialization` catalog simply doesn't carry.

**Importer behaviour:** left unset, reported. Deliberately *not* auto-created:
`Specialization` is a scope-bearing catalog with restricted creation precisely
because near-duplicate rows silently move records off a consultant's desk.
Fuzzy matching was measured and rejected — punctuation-normalising recovers 22
rows (2%), not worth the false-merge risk.

**No visibility impact today.** Specialization filtering ships stored-but-inactive
pending this backfill (see `CLAUDE.md`), so the live scope rule remains
`industry OR location`.

**Decision needed:** backfill the taxonomy with these 497 names (or a curated
subset). Because every write is an upsert on `displayId`, **re-running the
importer afterwards fills them in** with no other change.

### 🟡 2.2 Nine duplicate rows in the Specialization catalog

Two kinds, and only one is a real ambiguity:

**Cross-industry homonyms (2)** — genuinely different specializations sharing a
name:

| Name | Industries |
|---|---|
| `Steel` | Manufacturing · Construction |
| `Insurance` | Construction · Banking Financial Services |

*Handled.* The importer resolves specializations by name **and** the record's own
industry. Verified: 6 clients carry these, 0 misfiled.

**True duplicates (7)** — same name, same industry, same parent, loaded twice by
`import-taxonomy.ts`:

`Civil Estimator, NSW` · `Civil Supervisor, QLD` · `Class 3` · `Estimator` ·
`Joinery` · `Building Materials Glass` · `Industrial Machinery Heavy Duty Vehicles`

*Not handled, and not an importer concern.* Either id is semantically correct, so
the importer takes the first and stays deterministic. But records split across
two ids, so filtering by one misses the other.

**Decision needed:** dedupe the catalog — merge to one id and repoint references.
A small data migration. Note the catalog also carries case-variant near-dupes
(`Estimator`/`estimator`, `Civil Estimator, NSW`/`Civil estimator, NSW`) which
are the same problem in a milder form.

### 🟢 2.3 Combobox catalogs started empty

`JobTitle` had 8 rows, `JobRoleType` and `StakeholderRoleType` had 0. The sheet
is where their vocabulary lives.

**Importer behaviour:** creates them as it goes (~2,317 job titles, 259 job role
types, 30 stakeholder role types). This does not contradict the API rule that no
write endpoint grows a catalog on the way past — that rule governs the request
surface; the importer is the bootstrap path, and nothing else can populate these.

---

## 3. Fields with nowhere to land

### 🟡 3.1 Suburbs — historical; the location model these decisions were made under is gone

> **Superseded by issue #157.** `scripts/import-locations.ts` (the GeoNames
> loader this section describes) and `import-workbook.ts` (the one-time bulk
> loader this whole document is about) are both retired. The Location tree is
> now two rungs — Country / City Coverage, 13 seeded rows — not a
> GeoNames-scale tree with a missing SUBURB rung. Left below as a historical
> record of what the original import did, not as current behaviour.

The Location tree has **0 SUBURB nodes** — `scripts/import-locations.ts` loads
GeoNames `cities5000` and stops there by design; suburbs need the AU/MY postal
dumps, and Malaysian coverage there is thin.

Settled approach (at the time): map suburb columns **up to their CITY** and keep
the suburb as free text where a field exists.

| Sheet column | Fate (at the time) |
|---|---|
| `Candidate (Contact History)` → Suburb | ✅ survives as `CandidateContactHistory.suburb` (still live) |
| `Client(Company)` → Suburb & Postcode (es) | survived as `Client.suburbsAndPostcodes` — **column dropped by issue #157** (0/1652 rows were ever filled) |
| `Candidate (Info)` → Suburb & Postcode | ❌ dropped at the time; a later `Candidate.suburbAndPostcode` column was added, then **also dropped by issue #157** (1/3964 rows were ever filled) |
| `Clients(Marketplc Job Research)` → Suburbs | ❌ dropped — `ClientJobResearch` has `locationId` only |

### 🟡 3.2 Candidate city is only 78% filled — resolved by issue #157

The 891 Malaysian candidates carry a country but no city coverage. This is now
the *expected* shape, not a gap: `Candidate.locationId` may point at a country
when the city isn't known — see `docs/scope-explained.md` and CLAUDE.md's "The
two hierarchies". They're scoped to "Malaysia", not to a city, until someone
tags them with a specific City Coverage value.

---

## 4. Data the workbook does not contain

Not fixable by any importer — the history was never recorded.

| Tab | Rows |
|---|---|
| `Linktal JobOrder` | 17 |
| `Client (TOB Details)` | 17 |
| `Clients(Marketplc Job Research)` | 6 |
| `Client&Linkta (Contact History)` | 4 |
| `Cdd Clt Linktal Interact His` | 4 |

**There is no placements tab at all.** The only source for the
submission → interview → placement pipeline is the 4-row interactions tab, whose
"Actions records" column holds `Submitted`×2, `Interviewing`×1, `Placed`×1.

So the pipeline half of the system will be **effectively empty after import** —
roughly one placement. The 12,187 rows of real volume are clients, stakeholders,
candidates and candidate contact history.

### 🟡 4.1 Stakeholders have no surname

`Client (stakeholders)` has a `First Name *` column and no surname column at all.
2,390 distinct first names. `Stakeholder.lastName` stays null for all 6,451
imported contacts.

---

## 5. Linking

Only 2 of 10 tabs link by row number; the rest link by name. This is what
determines how reliably each tab attaches to its parent.

| Tab | Links by | Result |
|---|---|---|
| jobResearch, interactions, jobOrders | row-links (`"Hakka Pty Ltd - Row 439"`) | exact |
| stakeholders | company **name** — its ID column is 0% filled | 6,451 / 6,452 |
| tobs, clientContacts | company **name** | not yet run |
| candidateContacts | **no id at all** — see below | not yet run |

### 🟢 5.1 Candidate contact history has no candidate ID — resolved

The `Candidate (Contact History)` tab repeats the header
`Under Candidates  ID` five times. Decoded positionally, those columns are
actually:

| Col | Content | Fill |
|---|---|---|
| 1 | junk (`1`,`2`,`3`…) | 0% |
| 2 | first name | 58% |
| 3 | last name | 99% |
| 4 | email | 92% |
| 5 | mobile | 89% |

So 2,129 contact rows are matched to candidates on those, strongest key first —
email, then mobile, then name. Measured: 1,620 resolve on email alone, 134 more
on mobile, 98 on name, **0 fail outright**.

**Resolved: 2,127 / 2,129 imported (the 2 misses are blank rows), 0 ambiguous.**

Getting there needed one rule, which surfaced §1.8 below. 275 rows initially came
back ambiguous because their key is held by several candidates. Checked against
the data, **306 of the 344 shared emails are one person entered twice** — same
name, usually the same mobile. So: when every candidate behind a key carries the
same name it's a duplicate record and the contact attaches to the earliest row;
when the names differ it's genuinely different people and the row rejects. In
practice that resolved all 275.

### 🟡 1.8 ~400 duplicate candidate records

(Grouped here with §5.1 because that's what surfaced it.)

344 email addresses are shared by 744 candidate records:

| | Groups |
|---|---|
| All rows share one name — **the same person entered twice** | 306 |
| Names differ — shared/household email, or a typo | 38 |

Examples: `CDD-000001` and `CDD-000815` are both "Zeng Jun Pang" with the same
mobile; `CDD-000017` and `CDD-001411` are both "Adam Stewart".

**Importer behaviour:** contact history attaches to the earliest record. The
duplicate candidates themselves are all imported — they exist as separate rows.

**Decision needed:** same as §1.1 for clients — merge them, and pick a survivor.
Note this is a bigger job than the client duplicates (~400 records vs ~38) and
riskier, since contact history now hangs off the earliest of each pair.

---

## 6. Companies referenced but absent from the client list

### 🔴 6.1 TOBs and job orders for companies that aren't clients

The `Client (TOB Details)` and `Linktal JobOrder` tabs name companies the
`Client(Company)` tab doesn't contain. Since `clientId` is non-null on both
`Tob` and `JobOrder`, those rows can't be imported.

| Not in the client list |
|---|
| Pallion · Bangkok Bank · Standard Chartered Bank · SILC Group (Malaysia) Sdn Bhd · Third Party Platform |
| Careline · Funlab · Newly Weds Foods · Aryzta · Perfection Fresh |

**Result: 6 of 17 TOBs and 7 of 17 job orders skipped.**

A first pass lost more (9 TOBs, 12 job orders) because these tabs use short
informal names where the client list uses formal ones. Six were the same
company and are now matched via an explicit `COMPANY_ALIASES` table, keyed on
the client's `companyName` rather than its `displayId` — a fixed `Client-0261`
stopped being a stable reference once displayId became an ordinal assigned at
import time rather than a fixed spreadsheet-row encoding:

| Sheet says | Client record |
|---|---|
| `Cordina Chicken` | `CLI-000260` Cordina Chicken Farms Pty Ltd |
| `Regal Mushroom` | `CLI-000826` Regal Mushrooms |
| `Premier Fresh` | `CLI-000776` Premier Fresh Australia |
| `Baker's Maison` | `CLI-000127` Bakers Maison Australia |
| `JBS` | `CLI-000525` JBS Australia Pty Limited |
| `…Berhad` suffixes | handled by extending the legal-suffix strip |

**Hand-listed rather than fuzzy-matched, deliberately.** `Third Party Platform`
prefix-matches `Thirdi Group`, which is an entirely different company — a
contains/prefix heuristic would have scored six right and one silently wrong.

**Decision needed:** add the missing companies to the clients tab (then re-run),
or accept that those TOBs and job orders stay out.

### 🟡 6.2 Client-contact rows don't name a real stakeholder

All 4 rows of `Client&Linkta (Contact History)` have an "Under Client
Stakeholder ID" that is a bare number (`1536`) or a name that isn't one of that
client's contacts (`Min Xie`). **Importer behaviour:** the note attaches to the
client's first stakeholder, and says so — dropping it would lose the only
client-side notes in the system.

### 🟡 6.3 No placements are created

The one `Placed` action is imported as a submission with status PLACED, but no
`Placement` row. A placement needs a fee, base salary and start date; the
workbook records none of them, and inventing them would put fabricated money
into reporting. **Decision needed:** enter the real placement by hand.

---

## Import results — all 10 tabs complete

| Tab | Imported | Notes |
|---|---|---|
| clients | **1,645 / 1,645** | 0 rejects |
| stakeholders | **6,451 / 6,452** | 1 unknown company (§1.2) |
| candidates | **3,960 / 3,961** | 1 blank row; 868 lose specialization (§2.1) |
| candidateContacts | **2,127 / 2,129** | 2 blank rows; 0 ambiguous (§5.1) |
| tobs | **11 / 17** | 6 companies absent (§6.1) |
| jobResearch | **6 / 6** | suburbs dropped (§3.1) |
| jobOrders | **10 / 17** | 7 skipped: 5 companies absent, 2 annotation rows (§6.1) |
| clientContacts | **4 / 4** | attached to first stakeholder (§6.2) |
| interactions | **4 / 4** | → 4 submissions, 0 placements (§6.3) |

Resulting row counts: 1,645 clients · 3,363 client-locations · 6,451
stakeholders · 7,159 coverage rows · 3,960 candidates · 2,127 candidate contacts
· 11 TOBs · 6 research rows · 10 job orders · 4 submissions · 0 placements.
Catalogs bootstrapped: 2,327 JobTitle · 265 JobRoleType · 30 StakeholderRoleType.
