-- Candidate.notes: free text -> JSONB note timeline ([{content, timestamp, by}]).
-- Mirrors Client's notes-timeline migration (20260716185834_client_notes_timeline):
-- wraps any existing value as the first entry of its new timeline instead of a
-- plain ALTER COLUMN ... TYPE JSONB (which would fail on non-JSON text).
ALTER TABLE "Candidate" ADD COLUMN "notes_new" JSONB;

UPDATE "Candidate"
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

ALTER TABLE "Candidate" DROP COLUMN "notes";
ALTER TABLE "Candidate" RENAME COLUMN "notes_new" TO "notes";
