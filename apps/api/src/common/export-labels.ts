import { CandidateStatus, ClientQuality, ClientStatus, JobOrderQuality, JobOrderStatus } from '@prisma/client';

// Mirrors the frontend's display labels (apps/web/src/features/candidates/schema.ts,
// apps/web/src/features/companies/schema.ts) — duplicated here because export sheets
// are now built server-side and need the same human-readable strings the on-screen
// badges use, not the raw enum values.

export const candidateStatusLabels: Record<CandidateStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  PLACED: 'Placed',
  UNS: 'Unsuccessful',
};

export const clientStatusLabels: Record<ClientStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  TRADED: 'Traded',
};

export const clientQualityLabels: Record<ClientQuality, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const jobOrderStatusLabels: Record<JobOrderStatus, string> = {
  ACTIVE: 'Active',
  PLACED: 'Placed',
  ON_HOLD: 'On Hold',
  CLOSED: 'Closed',
};

export const jobOrderQualityLabels: Record<JobOrderQuality, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};
