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

export const candidateStatusLabels: Record<
  (typeof candidateStatuses)[number],
  string
> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
};

export type Candidate = {
  id: string;
  name: string;
  email: string;
  /** Current job title. */
  role: string;
  currentCompany: string;
  location: string;
  status: (typeof candidateStatuses)[number];
  /** Expected annual salary. */
  expectedSalary: number;
  noticePeriodDays: number;
  /** Consultant who owns this candidate. */
  owner: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
