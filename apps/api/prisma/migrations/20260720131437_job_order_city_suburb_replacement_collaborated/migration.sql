-- Rename (not drop+recreate) — JobOrder.location holds real data (64/67
-- non-null rows). A plain schema diff would drop it as unrelated to the new
-- `city` column and lose that data; RENAME COLUMN preserves it exactly,
-- matching the Job Orders Portfolio mockup's City column.
ALTER TABLE "JobOrder" RENAME COLUMN "location" TO "city";

-- New fields: Suburb (mockup's second location column, empty for all
-- existing rows), and the two flags from the mockup ("Replacement?",
-- "Collaborated?") — both simple booleans, no linked records.
ALTER TABLE "JobOrder" ADD COLUMN "suburb" TEXT;
ALTER TABLE "JobOrder" ADD COLUMN "isReplacement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobOrder" ADD COLUMN "isCollaborated" BOOLEAN NOT NULL DEFAULT false;
