-- Auto-generate Consultant.displayId at the DB level (consultant-####),
-- matching the other entities. Sequence seeds from the current max on a
-- populated DB and starts at 1 on a fresh one.
CREATE SEQUENCE "Consultant_displayId_seq" AS integer OWNED BY "Consultant"."displayId";
ALTER TABLE "Consultant" ALTER COLUMN "displayId"
  SET DEFAULT 'consultant-' || lpad(nextval('"Consultant_displayId_seq"')::text, 4, '0');
SELECT setval(
  '"Consultant_displayId_seq"',
  GREATEST(COALESCE((SELECT MAX(substring("displayId" from '[0-9]+$')::int) FROM "Consultant"), 0), 1),
  EXISTS (SELECT 1 FROM "Consultant")
);
