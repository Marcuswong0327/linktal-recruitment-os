import { JobOrderEntityStatus } from '@/lib/api/generated/types';
import type { JobOrderEntity } from '@/lib/api/generated/types';

// Types come straight from the generated API client, which is derived from
// the Prisma schema — the single source of truth. Don't hand-maintain shapes
// here.
export type JobOrder = JobOrderEntity;

// Job Order pipeline status (Workflow 3). Submission/interview stages live on
// CandidateSubmission instead — JobOrder itself only tracks these 4.
export const jobOrderStatuses = Object.values(JobOrderEntityStatus);
export type JobOrderStatus = (typeof jobOrderStatuses)[number];

export const jobOrderStatusLabels: Record<JobOrderStatus, string> = {
  ACTIVE: 'Active',
  PLACED: 'Placed',
  ON_HOLD: 'On Hold',
  CLOSED: 'Closed',
};

export const priorityLabels: Record<number, string> = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
};
