-- issue #157 follow-up: make Location.name globally unique, not just unique
-- per-parent. This is what lets every import/export column and in-app picker
-- key off a bare name ("Sydney NSW") instead of a breadcrumb path — safe
-- today because the 13 seeded names are already globally distinct, and
-- necessary going forward since admin can add further countries/city
-- coverages and two different countries could otherwise each mint a
-- same-named city coverage.
--
-- Replaces the per-parent uniqueness from 0_init and the country-only
-- partial index added earlier in this same issue's migration series.
BEGIN;

DROP INDEX IF EXISTS "Location_parentId_name_key";
DROP INDEX IF EXISTS "Location_country_name_key";
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

COMMIT;
