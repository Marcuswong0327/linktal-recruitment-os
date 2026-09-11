import { JobResearchEntityStatus } from '@/lib/api/generated/types';
import type { JobResearchEntity } from '@/lib/api/generated/types';
import { GetJobResearchSortBy } from '@/lib/api/generated/types/getJobResearchSortBy';
import { GetJobResearchSortOrder } from '@/lib/api/generated/types/getJobResearchSortOrder';

// Types come straight from the generated API client, which is derived from
// the Prisma schema — the single source of truth. Don't hand-maintain shapes
// here.
export type JobResearch = JobResearchEntity;

// The client-status snapshot taken when the ad was logged — same enum as
// Companies, reused here rather than redeclared (see JobResearchEntity.status doc).
export const jobResearchStatuses = Object.values(JobResearchEntityStatus).filter((v): v is NonNullable<typeof v> => v !== null);
export type JobResearchStatus = (typeof jobResearchStatuses)[number];

export const jobResearchStatusLabels: Record<JobResearchStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  TRADED: 'Traded',
  UNS: 'UNS',
};

export const jobResearchStatusVariants: Record<JobResearchStatus, 'info' | 'warning' | 'success' | 'muted'> = {
  COLD: 'info',
  WARM: 'warning',
  TRADED: 'success',
  UNS: 'muted',
};

export const jobResearchStatusTriggerClassName: Record<JobResearchStatus, string> = {
  COLD: 'border-info/30 bg-info/10 text-info',
  WARM: 'border-warning/30 bg-warning/10 text-warning',
  TRADED: 'border-success/30 bg-success/10 text-success',
  UNS: 'border-transparent bg-muted text-muted-foreground',
};

export const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string | null): string {
  return iso ? dateFormatter.format(new Date(iso)) : '—';
}

/** A research row carries one resolved Location node — a Country or City Coverage value, or none. */
export function cityCoverageLabel(row: Pick<JobResearch, 'location'>): string {
  return row.location ?? '—';
}

/** Filters from the search gate; table column filters merge on top at query time. */
export interface JobResearchAppliedFilters {
  statuses?: JobResearchStatus[];
  industryIds?: string[];
  specializationIds?: string[];
  /** Country + City selections merged — the API resolves any level through the location tree's ancestor path. */
  locationIds?: string[];
  clientIds?: string[];
  jobTitleIds?: string[];
  sortBy?: GetJobResearchSortBy;
  sortOrder?: GetJobResearchSortOrder;
}

interface SortOption {
  value: string;
  label: string;
  sortBy: GetJobResearchSortBy;
  sortOrder: GetJobResearchSortOrder;
}

// Gate "Sorted By" presets — date-based shortcuts. Column headers can still
// sort by jobTitle / client / location / salaryRange via GetJobResearchSortBy.
export const sortByOptions = [
  {
    value: 'mostRecentlyPosted',
    label: 'Most Recently Posted',
    sortBy: GetJobResearchSortBy.postedDate,
    sortOrder: GetJobResearchSortOrder.desc,
  },
  {
    value: 'mostRecentlyContacted',
    label: 'Most Recently Contacted',
    sortBy: GetJobResearchSortBy.lastContactedAt,
    sortOrder: GetJobResearchSortOrder.desc,
  },
  {
    value: 'leastRecentlyContacted',
    label: 'Least Recently Contacted',
    sortBy: GetJobResearchSortBy.lastContactedAt,
    sortOrder: GetJobResearchSortOrder.asc,
  },
] satisfies SortOption[];
export type SortByValue = (typeof sortByOptions)[number]['value'];
