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

/** "3mo ago" / "Never" — for `lastContactDate` (resolved live from the latest contact history row; see CandidateEntity.lastContactDate). */
export function formatRelativeContact(iso: string | null): string {
  if (!iso) return 'Never';
  const diffDays = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.round(diffMonths / 12)}y ago`;
}

/** Recency color for the last-contacted column — a call list is triage by how cold a candidate's gone, so color carries that meaning directly. */
export function contactRecencyClassName(iso: string | null): string {
  if (!iso) return 'text-muted-foreground';
  const diffDays = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays >= 180) return 'text-destructive';
  if (diffDays >= 90) return 'text-warning';
  return 'text-foreground';
}
