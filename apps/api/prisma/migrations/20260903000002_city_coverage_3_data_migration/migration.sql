-- issue #157, migration 2 of 3: the data move.
--
-- Strategy: PROMOTE the 11 nodes that survive rather than creating fresh rows
-- and remapping everything onto them. A promoted node keeps its id, so every
-- Candidate/JobOrder/ClientJobResearch/ClientLocation/StakeholderLocation/
-- ConsultantLocation row that already pointed at it (3,071 Sydney candidates
-- among them) needs no write at all. Only the handful of merge-sources
-- (North Sydney, the old "New South Wales" state tag, Gold Coast, Selangor,
-- Putrajaya) and a set of Malaysian state grants with no equivalent in the
-- approved catalog get remapped or dropped.
--
-- Every statement below is a name-keyed join, so this replays safely against
-- an empty (Prisma shadow) database — nothing matches, everything no-ops.
--
-- Runs BEFORE migration 3, which is the one that removes STATE/SUBURB from
-- the enum and drops the two dead suburb columns — kept separate because
-- that one is breaking for anyone on stale Prisma-generated code and should
-- only land once the app code in this PR is merged and pulled.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- ---------------------------------------------------------------------------
-- Step 0: snapshot "before" counts, to assert against at the end. Guarded so
-- this is a no-op on an empty database.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_issue157_before" AS
SELECT
  (SELECT count(*) FROM "Location")                        AS location_count,
  (SELECT count(*) FROM "Candidate")                        AS candidate_count,
  (SELECT count(*) FROM "Client")                           AS client_count,
  (SELECT count(*) FROM "Stakeholder")                      AS stakeholder_count,
  (SELECT count(*) FROM "JobOrder")                         AS job_order_count,
  (SELECT count(*) FROM "ClientJobResearch")                AS job_research_count,
  (SELECT count(*) FROM "Client" c WHERE c."deletedAt" IS NULL
     AND EXISTS (SELECT 1 FROM "ClientLocation" x WHERE x."clientId" = c.id)) AS clients_with_coverage,
  (SELECT count(*) FROM "Consultant" k
     WHERE EXISTS (SELECT 1 FROM "ConsultantLocation" x WHERE x."consultantId" = k.id)) AS consultants_with_grants;

-- ---------------------------------------------------------------------------
-- Step 1: promote the 11 survivors in place. isProtected=true marks them as
-- the approved catalog for good, per issue #157's "existing ones cannot be
-- edited or deleted" decision.
-- ---------------------------------------------------------------------------

UPDATE "Location" SET name = 'Sydney NSW', level = 'CITY_COVERAGE', "isProtected" = true,
  "parentId" = (SELECT id FROM "Location" WHERE level = 'COUNTRY' AND name = 'Australia')
WHERE level = 'CITY' AND name = 'Sydney'
  AND "parentId" = (SELECT id FROM "Location" WHERE level = 'STATE' AND name = 'New South Wales');

UPDATE "Location" SET name = 'Melbourne VIC', level = 'CITY_COVERAGE', "isProtected" = true,
  "parentId" = (SELECT id FROM "Location" WHERE level = 'COUNTRY' AND name = 'Australia')
WHERE level = 'CITY' AND name = 'Melbourne';

UPDATE "Location" SET name = 'Brisbane GC QLD', level = 'CITY_COVERAGE', "isProtected" = true,
  "parentId" = (SELECT id FROM "Location" WHERE level = 'COUNTRY' AND name = 'Australia')
WHERE level = 'CITY' AND name = 'Brisbane';

UPDATE "Location" SET name = 'Perth WA', level = 'CITY_COVERAGE', "isProtected" = true,
  "parentId" = (SELECT id FROM "Location" WHERE level = 'COUNTRY' AND name = 'Australia')
WHERE level = 'CITY' AND name = 'Perth';

UPDATE "Location" SET name = 'Canberra ACT', level = 'CITY_COVERAGE', "isProtected" = true,
  "parentId" = (SELECT id FROM "Location" WHERE level = 'COUNTRY' AND name = 'Australia')
WHERE level = 'CITY' AND name = 'Canberra';

UPDATE "Location" SET name = 'Newcastle NSW', level = 'CITY_COVERAGE', "isProtected" = true,
  "parentId" = (SELECT id FROM "Location" WHERE level = 'COUNTRY' AND name = 'Australia')
WHERE level = 'CITY' AND name = 'Newcastle';

-- Malaysian states are already parented directly under Malaysia — relevel in
-- place (and rename the one becoming a merged desk label); parent unchanged.
UPDATE "Location" SET name = 'KL Selangor', level = 'CITY_COVERAGE', "isProtected" = true
WHERE level = 'STATE' AND name = 'Kuala Lumpur'
  AND "parentId" = (SELECT id FROM "Location" WHERE level = 'COUNTRY' AND name = 'Malaysia');

UPDATE "Location" SET level = 'CITY_COVERAGE', "isProtected" = true WHERE level = 'STATE' AND name = 'Johor';
UPDATE "Location" SET level = 'CITY_COVERAGE', "isProtected" = true WHERE level = 'STATE' AND name = 'Penang';
UPDATE "Location" SET level = 'CITY_COVERAGE', "isProtected" = true WHERE level = 'STATE' AND name = 'Sarawak';
UPDATE "Location" SET level = 'CITY_COVERAGE', "isProtected" = true WHERE level = 'STATE' AND name = 'Sabah';

UPDATE "Location" SET "isProtected" = true WHERE level = 'COUNTRY' AND name IN ('Australia', 'Malaysia');

-- ---------------------------------------------------------------------------
-- Step 2: remap the merge-sources onto their promoted survivor.
--   North Sydney (city), "New South Wales" (state)  -> Sydney NSW
--   Gold Coast (city)                                -> Brisbane GC QLD
--   Selangor, Putrajaya (state)                      -> KL Selangor
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE "_issue157_merge_map" ("oldId" text PRIMARY KEY, "newId" text NOT NULL) ON COMMIT DROP;

INSERT INTO "_issue157_merge_map"
SELECT old.id, new.id FROM "Location" old, "Location" new
WHERE (old.level = 'CITY'  AND old.name = 'North Sydney'    AND new.name = 'Sydney NSW')
   OR (old.level = 'STATE' AND old.name = 'New South Wales' AND new.name = 'Sydney NSW')
   OR (old.level = 'CITY'  AND old.name = 'Gold Coast'      AND new.name = 'Brisbane GC QLD')
   OR (old.level = 'STATE' AND old.name = 'Selangor'        AND new.name = 'KL Selangor')
   OR (old.level = 'STATE' AND old.name = 'Putrajaya'       AND new.name = 'KL Selangor');

-- Single-FK sites: plain remap.
UPDATE "Candidate" c SET "locationId" = m."newId" FROM "_issue157_merge_map" m WHERE c."locationId" = m."oldId";
UPDATE "JobOrder" j SET "locationId" = m."newId" FROM "_issue157_merge_map" m WHERE j."locationId" = m."oldId";
UPDATE "ClientJobResearch" r SET "locationId" = m."newId" FROM "_issue157_merge_map" m WHERE r."locationId" = m."oldId";

-- Set-of-values sites: insert-then-delete with ON CONFLICT DO NOTHING, never
-- an in-place UPDATE — every owner of a merge-source in this dataset already
-- also holds the survivor node (e.g. every Brisbane client also holds Gold
-- Coast), so a naive UPDATE would raise a duplicate-PK error.
INSERT INTO "ClientLocation" ("clientId", "locationId")
SELECT DISTINCT cl."clientId", m."newId" FROM "ClientLocation" cl JOIN "_issue157_merge_map" m ON m."oldId" = cl."locationId"
ON CONFLICT DO NOTHING;
DELETE FROM "ClientLocation" cl USING "_issue157_merge_map" m WHERE cl."locationId" = m."oldId";

INSERT INTO "StakeholderLocation" ("stakeholderId", "locationId")
SELECT DISTINCT sl."stakeholderId", m."newId" FROM "StakeholderLocation" sl JOIN "_issue157_merge_map" m ON m."oldId" = sl."locationId"
ON CONFLICT DO NOTHING;
DELETE FROM "StakeholderLocation" sl USING "_issue157_merge_map" m WHERE sl."locationId" = m."oldId";

INSERT INTO "ConsultantLocation" ("consultantId", "locationId")
SELECT DISTINCT col."consultantId", m."newId" FROM "ConsultantLocation" col JOIN "_issue157_merge_map" m ON m."oldId" = col."locationId"
ON CONFLICT DO NOTHING;
DELETE FROM "ConsultantLocation" col USING "_issue157_merge_map" m WHERE col."locationId" = m."oldId";

-- ---------------------------------------------------------------------------
-- Step 3: drop consultant grants on Malaysian states with no equivalent in
-- the approved catalog (Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang,
-- Perak, Perlis, Terengganu) and on Labuan (folded out of "East Malaysia" per
-- issue #157). Deliberately dropped rather than widened to the Malaysia
-- country grant: none of these states has ever tagged an actual
-- Candidate/Client/Stakeholder/JobOrder/ClientJobResearch record (confirmed
-- against live data before writing this migration), so nobody's visible
-- record set changes — widening to COUNTRY would instead have *grown* it.
-- ---------------------------------------------------------------------------

DELETE FROM "ConsultantLocation" col
USING "Location" l
WHERE col."locationId" = l.id
  AND l.level = 'STATE'
  AND l.name IN ('Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Terengganu', 'Labuan');

-- ---------------------------------------------------------------------------
-- Step 4: everything left unreferenced and unprotected is dead GeoNames
-- weight — delete it. Children (CITY) before parents (STATE): Location's own
-- parentId FK is ON DELETE RESTRICT, so a STATE with a surviving CITY child
-- would otherwise block this.
-- ---------------------------------------------------------------------------

DELETE FROM "Location" l
WHERE l."isProtected" = false
  AND l.level = 'CITY'
  AND NOT EXISTS (SELECT 1 FROM "Candidate" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "JobOrder" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ClientJobResearch" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ClientLocation" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "StakeholderLocation" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ConsultantLocation" x WHERE x."locationId" = l.id);

DELETE FROM "Location" l
WHERE l."isProtected" = false
  AND l.level = 'STATE'
  AND NOT EXISTS (SELECT 1 FROM "Candidate" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "JobOrder" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ClientJobResearch" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ClientLocation" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "StakeholderLocation" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ConsultantLocation" x WHERE x."locationId" = l.id);

-- Anything still unreferenced and unprotected at this point (a stray SUBURB
-- row, or a COUNTRY that was never one of the two) is equally dead weight.
DELETE FROM "Location" l
WHERE l."isProtected" = false
  AND NOT EXISTS (SELECT 1 FROM "Candidate" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "JobOrder" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ClientJobResearch" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ClientLocation" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "StakeholderLocation" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "ConsultantLocation" x WHERE x."locationId" = l.id)
  AND NOT EXISTS (SELECT 1 FROM "Location" c WHERE c."parentId" = l.id);

-- ---------------------------------------------------------------------------
-- Step 5: recompute ancestorIds for the final two-level tree, inline in this
-- transaction (not as a separate post-migration script) so there is no
-- window where a promoted/merged node has a stale or empty ancestorIds array
-- — scope.ts's `hasSome` check would silently match nothing for that window.
-- Identical recursive CTE to scripts/backfill-ancestors.ts, Location only.
-- ---------------------------------------------------------------------------

WITH RECURSIVE chain AS (
  SELECT id AS "rowId", id AS "nodeId", "parentId", 1 AS depth FROM "Location"
  UNION ALL
  SELECT c."rowId", p.id, p."parentId", c.depth + 1
  FROM chain c JOIN "Location" p ON p.id = c."parentId"
)
UPDATE "Location" t
SET "ancestorIds" = a.ids
FROM (SELECT "rowId", array_agg("nodeId" ORDER BY depth) AS ids FROM chain GROUP BY "rowId") a
WHERE t.id = a."rowId";

-- ---------------------------------------------------------------------------
-- Step 6: assertions. Every check is guarded by "was there data to begin
-- with" so this migration replays cleanly against an empty (shadow) database.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  had_data boolean;
  loc_count bigint;
  protected_count bigint;
  bad_ancestor_count bigint;
  lost_clients bigint;
BEGIN
  SELECT location_count > 0 INTO had_data FROM "_issue157_before";
  IF NOT had_data THEN
    RETURN;
  END IF;

  SELECT count(*) INTO loc_count FROM "Location";
  IF loc_count <> 13 THEN
    RAISE EXCEPTION 'issue157: expected exactly 13 Location rows after migration, found %', loc_count;
  END IF;

  SELECT count(*) INTO protected_count FROM "Location" WHERE "isProtected";
  IF protected_count <> 13 THEN
    RAISE EXCEPTION 'issue157: expected all 13 Location rows to be isProtected, found %', protected_count;
  END IF;

  SELECT count(*) INTO bad_ancestor_count FROM "Location"
  WHERE "ancestorIds" IS NULL
     OR cardinality("ancestorIds") = 0
     OR "ancestorIds"[1] <> id
     OR (level = 'COUNTRY' AND cardinality("ancestorIds") <> 1)
     OR (level = 'CITY_COVERAGE' AND cardinality("ancestorIds") <> 2);
  IF bad_ancestor_count <> 0 THEN
    RAISE EXCEPTION 'issue157: % Location rows have a malformed ancestorIds', bad_ancestor_count;
  END IF;

  -- Client requires >=1 City Coverage tag at the application layer
  -- (assertHasLocations in clients.service.ts), so every live client already
  -- had one before this migration touched anything. A live client with zero
  -- now proves this migration lost data, not that it started with none.
  SELECT count(*) INTO lost_clients FROM "Client" c
  WHERE c."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "ClientLocation" x WHERE x."clientId" = c.id);
  IF lost_clients > 0 THEN
    RAISE EXCEPTION 'issue157: % clients ended this migration with zero City Coverage tags', lost_clients;
  END IF;

  RAISE NOTICE 'issue157 migration 2: % Location rows, % protected, ancestorIds clean', loc_count, protected_count;
END $$;

COMMIT;
