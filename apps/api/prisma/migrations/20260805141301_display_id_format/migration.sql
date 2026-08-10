-- Fix displayId defaults: the old `lpad(v, 4, '0')` truncates instead of
-- growing once a sequence passes 9999 (e.g. nextval 10000 on "Client"
-- rendered "Client-1000", a duplicate of the existing row). This introduces
-- a shared `display_id()` helper that pads to 6 digits but never truncates
-- beyond that, and repoints every model's displayId default at it.
--
-- CreateFunction
CREATE FUNCTION "display_id"(prefix text, seq regclass) RETURNS text AS $$
  SELECT prefix || lpad(t.v::text, greatest(6, length(t.v::text)), '0')
  FROM (SELECT nextval(seq) AS v) t
$$ LANGUAGE sql VOLATILE;

-- AlterTable
ALTER TABLE "Consultant" ALTER COLUMN "displayId" SET DEFAULT display_id('consultant-', '"Consultant_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "displayId" SET DEFAULT display_id('Client-', '"Client_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "Tob" ALTER COLUMN "displayId" SET DEFAULT display_id('TOB-', '"Tob_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "Stakeholder" ALTER COLUMN "displayId" SET DEFAULT display_id('Stake-', '"Stakeholder_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "StakeholderContactHistory" ALTER COLUMN "displayId" SET DEFAULT display_id('CN-', '"StakeholderContactHistory_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "ClientJobResearch" ALTER COLUMN "displayId" SET DEFAULT display_id('JR-', '"ClientJobResearch_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "Candidate" ALTER COLUMN "displayId" SET DEFAULT display_id('CDD-', '"Candidate_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "CandidateContactHistory" ALTER COLUMN "displayId" SET DEFAULT display_id('CDN-', '"CandidateContactHistory_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "JobOrder" ALTER COLUMN "displayId" SET DEFAULT display_id('JO-', '"JobOrder_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "CandidateSubmission" ALTER COLUMN "displayId" SET DEFAULT display_id('SUB-', '"CandidateSubmission_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "Interview" ALTER COLUMN "displayId" SET DEFAULT display_id('INT-', '"Interview_displayId_seq"'::regclass);

-- AlterTable
ALTER TABLE "Placement" ALTER COLUMN "displayId" SET DEFAULT display_id('PLC-', '"Placement_displayId_seq"'::regclass);
