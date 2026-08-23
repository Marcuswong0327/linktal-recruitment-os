-- Data migration: the previous migration added JobOrder.activeSubmissionCount
-- (default 0) and JobOrder.lastSubmittedAt (default null) — correct for a
-- brand-new job order, but every existing one needs these computed from its
-- current CandidateSubmission rows, or they'd sit at 0/null until their next
-- submission mutation happens to trigger SubmissionsService.recomputeJobOrderCounters.
-- Job orders with no submissions at all are untouched, correctly keeping the
-- column defaults (they never appear in the subquery below).
UPDATE "JobOrder" jo
SET "activeSubmissionCount" = sub.active_count,
    "lastSubmittedAt" = sub.last_submitted
FROM (
  SELECT
    "jobOrderId",
    COUNT(*) FILTER (WHERE status != 'REJECTED') AS active_count,
    MAX("submittedAt") AS last_submitted
  FROM "CandidateSubmission"
  WHERE "deletedAt" IS NULL
  GROUP BY "jobOrderId"
) sub
WHERE jo.id = sub."jobOrderId";
