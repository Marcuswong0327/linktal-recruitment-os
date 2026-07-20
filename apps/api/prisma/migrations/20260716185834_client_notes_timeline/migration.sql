-- Client.notes: free text -> JSONB note timeline ([{content, timestamp, by}]).
--
-- A plain ALTER COLUMN ... TYPE JSONB USING "notes"::jsonb would fail here:
-- existing values are bare strings (e.g. "Auto-created from Job Interviewing
-- History import"), not valid JSON text. Instead, wrap each existing value as
-- the first entry of its new timeline. `timestamp` falls back to the row's
-- createdAt (closest available signal to when that note was written); `by`
-- is NULL since legacy/imported notes have no consultant attribution.
ALTER TABLE "Client" ADD COLUMN "notes_new" JSONB;

UPDATE "Client"
SET "notes_new" = CASE
  WHEN "notes" IS NOT NULL THEN
    jsonb_build_array(
      jsonb_build_object(
        'content', "notes",
        'timestamp', to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'by', NULL
      )
    )
  ELSE NULL
END;

ALTER TABLE "Client" DROP COLUMN "notes";
ALTER TABLE "Client" RENAME COLUMN "notes_new" TO "notes";
