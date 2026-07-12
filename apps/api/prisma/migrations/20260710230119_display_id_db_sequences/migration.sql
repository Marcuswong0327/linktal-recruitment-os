-- Auto-generate displayId at the DB level via per-table sequences.
-- Each sequence is seeded from the current max so it continues the series on a
-- populated DB, and starts at 1 on a fresh DB (setval is_called = rows exist).

-- Candidate: CDD-####
CREATE SEQUENCE "Candidate_displayId_seq" AS integer OWNED BY "Candidate"."displayId";
ALTER TABLE "Candidate" ALTER COLUMN "displayId"
  SET DEFAULT 'CDD-' || lpad(nextval('"Candidate_displayId_seq"')::text, 4, '0');
SELECT setval(
  '"Candidate_displayId_seq"',
  GREATEST(COALESCE((SELECT MAX(substring("displayId" from '[0-9]+$')::int) FROM "Candidate"), 0), 1),
  EXISTS (SELECT 1 FROM "Candidate")
);

-- Client: Client-####
CREATE SEQUENCE "Client_displayId_seq" AS integer OWNED BY "Client"."displayId";
ALTER TABLE "Client" ALTER COLUMN "displayId"
  SET DEFAULT 'Client-' || lpad(nextval('"Client_displayId_seq"')::text, 4, '0');
SELECT setval(
  '"Client_displayId_seq"',
  GREATEST(COALESCE((SELECT MAX(substring("displayId" from '[0-9]+$')::int) FROM "Client"), 0), 1),
  EXISTS (SELECT 1 FROM "Client")
);

-- Stakeholder: Stake-####
CREATE SEQUENCE "Stakeholder_displayId_seq" AS integer OWNED BY "Stakeholder"."displayId";
ALTER TABLE "Stakeholder" ALTER COLUMN "displayId"
  SET DEFAULT 'Stake-' || lpad(nextval('"Stakeholder_displayId_seq"')::text, 4, '0');
SELECT setval(
  '"Stakeholder_displayId_seq"',
  GREATEST(COALESCE((SELECT MAX(substring("displayId" from '[0-9]+$')::int) FROM "Stakeholder"), 0), 1),
  EXISTS (SELECT 1 FROM "Stakeholder")
);

-- JobOrder: JO-####
CREATE SEQUENCE "JobOrder_displayId_seq" AS integer OWNED BY "JobOrder"."displayId";
ALTER TABLE "JobOrder" ALTER COLUMN "displayId"
  SET DEFAULT 'JO-' || lpad(nextval('"JobOrder_displayId_seq"')::text, 4, '0');
SELECT setval(
  '"JobOrder_displayId_seq"',
  GREATEST(COALESCE((SELECT MAX(substring("displayId" from '[0-9]+$')::int) FROM "JobOrder"), 0), 1),
  EXISTS (SELECT 1 FROM "JobOrder")
);
