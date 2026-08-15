-- Candidate notes redesign:
--  - Candidate.notes (JSONB note timeline) is removed — CandidateContactHistory
--    already covers this via category/screeningNotes/outreachCampaignNotes.
--    Only 3 candidates / 6 entries have any data here — dropped, not migrated.
--  - CandidateContactHistory.category becomes a real enum (ContactCategory).
--    It previously held 4 messy free-text values, with the SMS/email channel
--    distinction smuggled into the string itself ("Outreached Campaign -
--    SMS"/"- Email") rather than living on its own field. A new
--    OutreachChannel enum column captures that distinction properly;
--    outreachCampaignNotes (the free-text campaign notes field) is untouched.
--  - conversationSummary is renamed to screeningNotes (same content, clearer
--    name — it's screening-call notes, not a generic "conversation").
--  - editedAt/editedById are added so screeningNotes can be edited after
--    creation (author-or-admin gated, optimistic concurrency) while every
--    other field on the row stays an immutable factual record.
--
-- Order matters: the outreachChannel backfill reads the OLD category string
-- values, so it must happen before category's type conversion discards them.
-- Confirmed via live query: category has zero NULLs across all 2127 rows, so
-- the enum column can go straight to NOT NULL with no null-handling branch.

BEGIN;

-- ---------------------------------------------------------------------------
-- Candidate.notes: drop (negligible data — 3 candidates, 6 entries total)
-- ---------------------------------------------------------------------------
ALTER TABLE "Candidate" DROP COLUMN "notes";

-- ---------------------------------------------------------------------------
-- CandidateContactHistory: category -> enum, new outreachChannel enum,
-- conversationSummary -> screeningNotes, new editedAt/editedById
-- ---------------------------------------------------------------------------
CREATE TYPE "ContactCategory" AS ENUM ('SCREENING', 'OUTREACH');
CREATE TYPE "OutreachChannel" AS ENUM ('SMS', 'EMAIL');

ALTER TABLE "CandidateContactHistory" ADD COLUMN "outreachChannel" "OutreachChannel";
UPDATE "CandidateContactHistory" SET "outreachChannel" = 'SMS'   WHERE "category" = 'Outreached Campaign - SMS';
UPDATE "CandidateContactHistory" SET "outreachChannel" = 'EMAIL' WHERE "category" = 'Outreached Campaign - Email';
-- The generic "Outreach Campaign History" bucket (573 rows) stays NULL —
-- its outreachCampaignNotes text is inconsistent free text (some rows just
-- say "SMS Campaign" as a note, most don't), not safely inferrable.

ALTER TABLE "CandidateContactHistory"
  ALTER COLUMN "category" TYPE "ContactCategory"
  USING (
    CASE
      WHEN "category" ILIKE '%Screening%' THEN 'SCREENING'
      WHEN "category" ILIKE '%Outreach%'  THEN 'OUTREACH'
    END
  )::"ContactCategory";
ALTER TABLE "CandidateContactHistory" ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "CandidateContactHistory" RENAME COLUMN "conversationSummary" TO "screeningNotes";
ALTER TABLE "CandidateContactHistory" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "CandidateContactHistory" ADD COLUMN "editedById" TEXT;

COMMIT;
