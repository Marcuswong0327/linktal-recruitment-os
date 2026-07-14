import { z } from 'zod';
import { CreateCandidateDtoStatus } from '@/lib/api/generated/types';
import type { CandidateEntity } from '@/lib/api/generated/types';

// Types come straight from the generated API client, which is derived from the
// Prisma schema — the single source of truth. Don't hand-maintain shapes here.
export type Candidate = CandidateEntity;

export const candidateStatuses = Object.values(CreateCandidateDtoStatus);
export type CandidateStatus = (typeof candidateStatuses)[number];

export const candidateStatusLabels: Record<
  (typeof candidateStatuses)[number],
  string
> = {
  COLD: 'Cold',
  WARM: 'Warm',
  HOT: 'Hot',
  PLACED: 'Placed',
};

// Temperature scale: blue → yellow → red, green once placed. Shared by the
// table's status column and the status filter so the pills always match.
export const candidateStatusVariants: Record<
  (typeof candidateStatuses)[number],
  'info' | 'warning' | 'destructive' | 'success'
> = {
  COLD: 'info',
  WARM: 'warning',
  HOT: 'destructive',
  PLACED: 'success',
};

// Drives the colored EnumSelect trigger pill (edit drawer) — matches
// candidateStatusVariants so the pill and the status filter/table pill agree.
export const candidateStatusTriggerClassName: Record<(typeof candidateStatuses)[number], string> = {
  COLD: 'border-info/30 bg-info/10 text-info',
  WARM: 'border-warning/30 bg-warning/10 text-warning',
  HOT: 'border-destructive/30 bg-destructive/10 text-destructive',
  PLACED: 'border-success/30 bg-success/10 text-success',
};

// Client-side validation for the create form. Fields and the status enum mirror
// CreateCandidateDto; the parsed output is assignable to it.
export const createCandidateSchema = z.object({
  displayId: z
    .string()
    .min(2, 'Display ID is required')
    .max(20),
  fullName: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(120),
  email: z
    .string()
    .email('Enter a valid email address')
    .max(255)
    .optional()
    .or(z.literal('')),
  mobile: z.string().max(30).optional(),
  currentPosition: z.string().max(120).optional(),
  status: z.nativeEnum(CreateCandidateDtoStatus),
  notes: z.string().max(2000).optional(),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
