-- Digits-only mirror of Candidate.mobile, so phone search matches whatever
-- format the number was typed in.
--
-- The stored data is inconsistent: of 3,717 candidates with a mobile, some
-- start "+60", some "0", some a bare digit, and every group carries spaces,
-- dashes or brackets. A literal `contains` on `mobile` therefore missed the
-- person whenever the typed format differed from the stored one — pasting
-- "0123456789" found nothing when the row held "012-345 6789".
--
-- Maintained by a trigger rather than by application code so that the workbook
-- importer and any raw/bulk load stay correct without having to remember it.
-- A trigger (unlike a GENERATED column) is invisible to Prisma's schema diff,
-- so the column stays an ordinary nullable text field as far as Prisma is
-- concerned and no drift is reported.

ALTER TABLE "Candidate" ADD COLUMN "mobile_digits" TEXT;

CREATE OR REPLACE FUNCTION candidate_set_mobile_digits()
RETURNS TRIGGER AS $$
BEGIN
  NEW."mobile_digits" := NULLIF(regexp_replace(COALESCE(NEW."mobile", ''), '[^0-9]', '', 'g'), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidate_mobile_digits_trg
  BEFORE INSERT OR UPDATE OF "mobile" ON "Candidate"
  FOR EACH ROW
  EXECUTE FUNCTION candidate_set_mobile_digits();

-- Backfill existing rows.
UPDATE "Candidate"
   SET "mobile_digits" = NULLIF(regexp_replace(COALESCE("mobile", ''), '[^0-9]', '', 'g'), '')
 WHERE "mobile" IS NOT NULL;

-- Same GIN/trigram treatment as the other searched columns.
CREATE INDEX "Candidate_mobileDigits_trgm_idx"
  ON "Candidate" USING GIN ("mobile_digits" gin_trgm_ops);
