-- issue #157, migration 1b of 3.
BEGIN;

ALTER TABLE "Location" ADD COLUMN "isProtected" BOOLEAN NOT NULL DEFAULT false;

-- Country-level rows have parentId = NULL, and NULL is not distinct from NULL
-- in a standard unique index — so today two rows can both be named
-- "Australia" at COUNTRY level. Close that so the seed's country lookup can
-- be a reliable "does this name already exist" check, and so `isProtected`
-- keys off an unambiguous name at the country level.
CREATE UNIQUE INDEX "Location_country_name_key" ON "Location"("name") WHERE "parentId" IS NULL;

COMMIT;
