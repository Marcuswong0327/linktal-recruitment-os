-- Candidate.notes: text -> JSONB note timeline (mirrors Client.notes' shape:
-- [{id, content, timestamp, by, editedAt, editedBy}]). Prisma's own diff for
-- this would DROP + recreate the column, losing any existing free text —
-- instead: add the new column, migrate existing text into a one-entry
-- timeline (author/edit fields null, since that information never existed
-- for the old flat field), then swap it in.

ALTER TABLE "Candidate" ADD COLUMN "notes_new" JSONB;

UPDATE "Candidate"
SET "notes_new" = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'content', "notes",
    'timestamp', "createdAt",
    'by', NULL,
    'editedAt', NULL,
    'editedBy', NULL
  )
)
WHERE "notes" IS NOT NULL AND trim("notes") <> '';

ALTER TABLE "Candidate" DROP COLUMN "notes";
ALTER TABLE "Candidate" RENAME COLUMN "notes_new" TO "notes";
