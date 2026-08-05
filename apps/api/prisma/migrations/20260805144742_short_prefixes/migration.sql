-- Client/Consultant/Stakeholder were the only three displayId prefixes not
-- following the short-code style every other model uses (TOB, JR, JO, SUB,
-- INT, CDD, CDN, CN, PLC). Repoints the defaults and rewrites every existing
-- row's prefix in place — the numeric suffix (already dense 1..N) is
-- untouched, so no renumbering is needed here.

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "displayId" SET DEFAULT display_id('CLI-', '"Client_displayId_seq"'::regclass);
UPDATE "Client" SET "displayId" = 'CLI-' || substring("displayId" from 8);

-- AlterTable
ALTER TABLE "Consultant" ALTER COLUMN "displayId" SET DEFAULT display_id('CST-', '"Consultant_displayId_seq"'::regclass);
UPDATE "Consultant" SET "displayId" = 'CST-' || substring("displayId" from 12);

-- AlterTable
ALTER TABLE "Stakeholder" ALTER COLUMN "displayId" SET DEFAULT display_id('STK-', '"Stakeholder_displayId_seq"'::regclass);
UPDATE "Stakeholder" SET "displayId" = 'STK-' || substring("displayId" from 7);
