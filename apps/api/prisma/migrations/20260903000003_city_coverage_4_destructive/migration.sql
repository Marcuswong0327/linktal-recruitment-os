-- issue #157, migration 3 of 3: the breaking one.
--
-- Removes STATE/SUBURB from LocationLevel (Postgres can't drop an enum value
-- directly — new-type-and-swap is the only route) and drops the columns this
-- migration made permanently dead: Location.postcode and Location.geonameId
-- (no level can carry a postcode any more; nothing loads GeoNames any more),
-- plus Candidate.suburbAndPostcode and Client.suburbsAndPostcodes (the last
-- traces of the granular model, filled on 1/3964 and 0/1652 rows).
--
-- Deploy this only after every app instance has picked up the matching code
-- change (regenerated Prisma client, updated DTOs/entities) — Prisma clients
-- generate explicit column lists, so a stale client hitting a dropped column
-- gets "column does not exist" on every request touching that table.

BEGIN;

-- ---------------------------------------------------------------------------
-- Enum: COUNTRY|STATE|CITY|SUBURB -> COUNTRY|CITY_COVERAGE.
-- Migration 1 already added CITY_COVERAGE and migration 2 already moved every
-- row off STATE/CITY/SUBURB, so this cast is safe.
-- ---------------------------------------------------------------------------
CREATE TYPE "LocationLevel_new" AS ENUM ('COUNTRY', 'CITY_COVERAGE');
ALTER TABLE "Location" ALTER COLUMN "level" TYPE "LocationLevel_new" USING ("level"::text::"LocationLevel_new");
DROP TYPE "LocationLevel";
ALTER TYPE "LocationLevel_new" RENAME TO "LocationLevel";

-- ---------------------------------------------------------------------------
-- Dead columns.
-- ---------------------------------------------------------------------------
ALTER TABLE "Location" DROP COLUMN "postcode";
ALTER TABLE "Location" DROP COLUMN "geonameId";
ALTER TABLE "Candidate" DROP COLUMN "suburbAndPostcode";
ALTER TABLE "Client" DROP COLUMN "suburbsAndPostcodes";

COMMIT;
