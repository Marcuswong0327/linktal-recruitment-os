import type { StakeholderEntity } from '@/lib/api/generated/types';

// Types come straight from the generated API client, which is derived from
// the Prisma schema — the single source of truth. Don't hand-maintain shapes
// here.
export type EnrichedStakeholder = StakeholderEntity;
