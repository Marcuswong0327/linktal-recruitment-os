import { ClientEntityQuality, ClientEntityStatus } from '@/lib/api/generated/types';
import type { ClientEntity } from '@/lib/api/generated/types';
import { GetClientsSortBy } from '@/lib/api/generated/types/getClientsSortBy';
import { GetClientsSortOrder } from '@/lib/api/generated/types/getClientsSortOrder';

// Types come straight from the generated API client, which is derived from
// the Prisma schema — the single source of truth. Don't hand-maintain shapes
// here.
export type Company = ClientEntity;

// Relationship status tracking (Workflow 2): Cold / Warm / Traded.
export const clientStatuses = Object.values(ClientEntityStatus);
export type ClientStatus = (typeof clientStatuses)[number];

export const clientStatusLabels: Record<ClientStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  TRADED: 'Traded',
  UNS: 'UNS',
};

export const statusVariant: Record<ClientStatus, 'info' | 'warning' | 'success' | 'muted'> = {
  COLD: 'info',
  WARM: 'warning',
  TRADED: 'success',
  UNS: 'muted',
};

// Drives the colored EnumSelect trigger pill — matches statusVariant so the
// pill and the status filter/table badge agree.
export const statusTriggerClassName: Record<ClientStatus, string> = {
  COLD: 'border-info/30 bg-info/10 text-info',
  WARM: 'border-warning/30 bg-warning/10 text-warning',
  TRADED: 'border-success/30 bg-success/10 text-success',
  UNS: 'border-transparent bg-muted text-muted-foreground',
};

export const statusOptions = clientStatuses.map((value) => ({
  value,
  label: clientStatusLabels[value],
  variant: statusVariant[value],
  triggerClassName: statusTriggerClassName[value],
}));

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

// Ascending scale: muted (low) -> info (medium) -> success (high) — same
// treatment as Job Orders' quality field, for a consistent look.
export const qualityVariant: Record<ClientQuality, 'muted' | 'info' | 'success'> = {
  LOW: 'muted',
  MEDIUM: 'info',
  HIGH: 'success',
};

export const qualityTriggerClassName: Record<ClientQuality, string> = {
  LOW: 'border-transparent bg-muted text-muted-foreground',
  MEDIUM: 'border-info/30 bg-info/10 text-info',
  HIGH: 'border-success/30 bg-success/10 text-success',
};

export const qualityOptions = clientQualities.map((value) => ({
  value,
  label: clientQualityLabels[value],
  variant: qualityVariant[value],
  triggerClassName: qualityTriggerClassName[value],
}));

export const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string | null): string {
  return iso ? dateFormatter.format(new Date(iso)) : '—';
}

/** Filters committed from the search gate's action bar — the table has no filter UI of its own anymore; this is its entire query beyond pagination. */
export interface CompanyAppliedFilters {
  statuses?: ClientStatus[];
  industryIds?: string[];
  specializationIds?: string[];
  /** Country + City selections merged — the API resolves any level through the location tree's ancestor path. */
  locationIds?: string[];
  sortBy?: GetClientsSortBy;
  sortOrder?: GetClientsSortOrder;
}

interface SortOption {
  value: string;
  label: string;
  sortBy: GetClientsSortBy;
  sortOrder: GetClientsSortOrder;
}

// A plain (non-readonly) array via `satisfies` rather than `as const` — the
// EnumSelect trigger it feeds expects a mutable `EnumSelectOption[]`, and
// `as const` would make this a readonly array TS won't assign there, while
// `satisfies` still narrows `value` to a literal union for `SortByValue`.
export const sortByOptions = [
  { value: 'alphabetical', label: 'Alphabetical (A-Z)', sortBy: GetClientsSortBy.companyName, sortOrder: GetClientsSortOrder.asc },
  {
    value: 'mostRecentlyContacted',
    label: 'Most Recently Contacted',
    sortBy: GetClientsSortBy.lastContactedAt,
    sortOrder: GetClientsSortOrder.desc,
  },
  {
    value: 'leastRecentlyContacted',
    label: 'Least Recently Contacted',
    sortBy: GetClientsSortBy.lastContactedAt,
    sortOrder: GetClientsSortOrder.asc,
  },
] satisfies SortOption[];
export type SortByValue = (typeof sortByOptions)[number]['value'];
