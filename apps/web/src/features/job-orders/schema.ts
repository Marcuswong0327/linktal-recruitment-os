import { JobOrderEntityQuality, JobOrderEntityStatus } from '@/lib/api/generated/types';
import type { JobOrderEntity, JobOrderPipelineCandidateEntity } from '@/lib/api/generated/types';

// Types come straight from the generated API client, which is derived from
// the Prisma schema — the single source of truth. Don't hand-maintain shapes
// here.
export type JobOrder = JobOrderEntity;
export type PipelineCandidate = JobOrderPipelineCandidateEntity;

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

// Shared by the table's status column, the status filter, and the inline
// status editor so the pills always match.
export const statusVariant: Record<JobOrderStatus, 'info' | 'success' | 'muted' | 'destructive'> = {
  ACTIVE: 'info',
  PLACED: 'success',
  ON_HOLD: 'muted',
  CLOSED: 'destructive',
};

// Drives the colored EnumSelect trigger pill (edit drawer) — matches
// statusVariant so the pill and the status filter/table pill agree.
export const statusTriggerClassName: Record<JobOrderStatus, string> = {
  ACTIVE: 'border-info/30 bg-info/10 text-info',
  PLACED: 'border-success/30 bg-success/10 text-success',
  ON_HOLD: 'border-transparent bg-muted text-muted-foreground',
  CLOSED: 'border-destructive/30 bg-destructive/10 text-destructive',
};

// Quality of the job order/posting itself — same LOW/MEDIUM/HIGH scale and
// styling as Client.quality (Companies feature), for a consistent look.
export const jobOrderQualities = Object.values(JobOrderEntityQuality);
export type JobOrderQuality = (typeof jobOrderQualities)[number];

export const jobOrderQualityLabels: Record<JobOrderQuality, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

// Ascending scale: muted (low) -> info (medium) -> success (high).
export const qualityVariant: Record<JobOrderQuality, 'muted' | 'info' | 'success'> = {
  LOW: 'muted',
  MEDIUM: 'info',
  HIGH: 'success',
};

export const qualityTriggerClassName: Record<JobOrderQuality, string> = {
  LOW: 'border-transparent bg-muted text-muted-foreground',
  MEDIUM: 'border-info/30 bg-info/10 text-info',
  HIGH: 'border-success/30 bg-success/10 text-success',
};

export const qualityOptions = jobOrderQualities.map((value) => ({
  value,
  label: jobOrderQualityLabels[value],
  variant: qualityVariant[value],
  triggerClassName: qualityTriggerClassName[value],
}));

export const priorityLabels: Record<number, string> = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
};

export const priorityVariant: Record<number, 'destructive' | 'warning' | 'muted'> = {
  1: 'destructive',
  2: 'warning',
  3: 'muted',
};

// Drives the colored EnumSelect trigger pill (edit drawer) — matches
// priorityVariant so the pill and the priority filter/table pill agree.
export const priorityTriggerClassName: Record<number, string> = {
  1: 'border-destructive/30 bg-destructive/10 text-destructive',
  2: 'border-warning/30 bg-warning/10 text-warning',
  3: 'border-transparent bg-muted text-muted-foreground',
};

// Single option list per field — shared by the table's filter/bulk actions,
// the row edit drawer, and the detail page instead of each rebuilding it.
export const statusOptions = jobOrderStatuses.map((value) => ({
  value,
  label: jobOrderStatusLabels[value],
  variant: statusVariant[value],
  triggerClassName: statusTriggerClassName[value],
}));

export const priorityOptions = Object.entries(priorityLabels).map(([value, label]) => ({
  value,
  label,
  variant: priorityVariant[Number(value)],
  triggerClassName: priorityTriggerClassName[Number(value)],
}));
