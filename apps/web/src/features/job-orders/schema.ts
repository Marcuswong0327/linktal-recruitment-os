// Job Order pipeline status (Workflow 3). PLACED / ON_HOLD / CLOSED are terminal-ish.
export const jobOrderStatuses = [
  'OPEN',
  'SUBMITTED',
  'INTERVIEWING',
  'OFFER',
  'PLACED',
  'ON_HOLD',
  'CLOSED',
] as const;
export type JobOrderStatus = (typeof jobOrderStatuses)[number];

export const jobOrderStatusLabels: Record<JobOrderStatus, string> = {
  OPEN: 'Open',
  SUBMITTED: 'Submitted',
  INTERVIEWING: 'Interviewing',
  OFFER: 'Offer',
  PLACED: 'Placed',
  ON_HOLD: 'On Hold',
  CLOSED: 'Closed',
};

export type JobOrder = {
  id: string;
  title: string;
  /** Client company name (see features/companies/mock.ts). */
  company: string;
  hiringManager: string;
  industry: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  /** Placement fee value. */
  feeValue: number;
  status: JobOrderStatus;
  /** Candidates currently submitted against this order. */
  candidateCount: number;
  /** Consultant assigned to the order. */
  consultant: string;
  openedAt: string;
  createdAt: string;
  updatedAt: string;
};
