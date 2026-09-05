-- issue #157, migration 1 of 3 (additive, safe on a live shared DB).
--
-- Adds the new enum value and the protected-row flag. Does NOT touch STATE/
-- SUBURB or any data yet — those stay valid and readable so the app keeps
-- working for anyone who hasn't pulled this branch. Migration 2 moves the
-- data; migration 3 (run only after everyone has pulled and regenerated)
-- drops STATE/SUBURB and the dead suburb columns.
--
-- No BEGIN/COMMIT: Postgres cannot use a new enum value inside the same
-- transaction that added it, so ADD VALUE must commit on its own.

ALTER TYPE "LocationLevel" ADD VALUE IF NOT EXISTS 'CITY_COVERAGE' AFTER 'COUNTRY';
