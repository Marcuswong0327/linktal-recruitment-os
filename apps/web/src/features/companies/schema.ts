import { ClientEntityQuality, ClientEntityStatus } from '@/lib/api/generated/types';
import type { ClientEntity } from '@/lib/api/generated/types';

// Types come straight from the generated API client, which is derived from
// the Prisma schema — the single source of truth. Don't hand-maintain shapes
// here.
export type Company = ClientEntity;

// Relationship status tracking from the spec (Workflow 2): Cold / Warm / Traded.
export const clientStatuses = Object.values(ClientEntityStatus);
export type ClientStatus = (typeof clientStatuses)[number];

export const clientStatusLabels: Record<ClientStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  TRADED: 'Traded',
};

// Lead quality: a recruiter's subjective read on how good a prospect this
// client is. Ordinal (Low < Medium < High) — the DB enum is declared in that
// order specifically so it sorts meaningfully, unlike status.
export const clientQualities = Object.values(ClientEntityQuality);
export type ClientQuality = (typeof clientQualities)[number];

export const clientQualityLabels: Record<ClientQuality, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};
