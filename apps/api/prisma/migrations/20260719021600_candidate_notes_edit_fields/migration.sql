-- Candidate.notes: upgrade each timeline entry to the richer shape used by
-- CandidateNoteDto ([{id, content, timestamp, by, editedAt, editedBy}],
-- mirrors ClientNoteDto/Client.notes exactly). The column itself was already
-- converted from free text to a JSONB array by 20260718161035_candidate_notes_timeline
-- ([{content, timestamp, by}]) -- this migration only backfills the missing
-- per-entry keys (id for edit/delete addressing, editedAt/editedBy for the
-- optimistic-concurrency edit flow), it doesn't touch the column type.
UPDATE "Candidate"
SET "notes" = (
  SELECT jsonb_agg(
    entry || jsonb_build_object(
      'id', gen_random_uuid()::text,
      'editedAt', NULL,
      'editedBy', NULL
    )
  )
  FROM jsonb_array_elements("notes") AS entry
)
WHERE "notes" IS NOT NULL;
