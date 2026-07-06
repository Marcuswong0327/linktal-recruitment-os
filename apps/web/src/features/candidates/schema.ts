import { z } from 'zod';

export const candidateStatuses = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
] as const;

export const createCandidateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().email('Enter a valid email address'),
  role: z.string().min(2, 'Role is required').max(120),
  status: z.enum(candidateStatuses).default('APPLIED'),
  notes: z.string().max(2000).optional(),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export type Candidate = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: (typeof candidateStatuses)[number];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
