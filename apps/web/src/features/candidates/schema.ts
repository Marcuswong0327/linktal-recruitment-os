import { CreateCandidateDtoStatus } from '@/lib/api/generated/types';
import type { CandidateEntity } from '@/lib/api/generated/types';

// Types come straight from the generated API client, which is derived from the
// Prisma schema — the single source of truth. Don't hand-maintain shapes here.
export type Candidate = CandidateEntity;

// No combined "fullName" field on the entity — firstName/lastName are
// separate and both nullable (see CandidateEntity.firstName/lastName).
export function candidateFullName(c: Pick<Candidate, 'firstName' | 'lastName'>): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

export const candidateStatuses = Object.values(CreateCandidateDtoStatus);
export type CandidateStatus = (typeof candidateStatuses)[number];

export const candidateStatusLabels: Record<
  (typeof candidateStatuses)[number],
  string
> = {
  COLD: 'Cold',
  WARM: 'Warm',
  PLACED: 'Placed',
  UNS: 'Unsuccessful',
};

// Temperature scale: blue → yellow, green once placed, muted once ruled out.
// Shared by the table's status column and the status filter so the pills
// always match.
export const candidateStatusVariants: Record<
  (typeof candidateStatuses)[number],
  'info' | 'warning' | 'success' | 'muted'
> = {
  COLD: 'info',
  WARM: 'warning',
  PLACED: 'success',
  UNS: 'muted',
};

// Drives the colored EnumSelect trigger pill (edit drawer) — matches
// candidateStatusVariants so the pill and the status filter/table pill agree.
export const candidateStatusTriggerClassName: Record<(typeof candidateStatuses)[number], string> = {
  COLD: 'border-info/30 bg-info/10 text-info',
  WARM: 'border-warning/30 bg-warning/10 text-warning',
  PLACED: 'border-success/30 bg-success/10 text-success',
  UNS: 'border-transparent bg-muted text-muted-foreground',
};
