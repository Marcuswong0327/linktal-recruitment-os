import { ClientEntityStatus } from '@/lib/api/generated/types';
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
