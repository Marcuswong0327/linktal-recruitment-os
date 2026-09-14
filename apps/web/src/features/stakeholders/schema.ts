import { GetStakeholdersSortBy } from '@/lib/api/generated/types/getStakeholdersSortBy';
import { GetStakeholdersSortOrder } from '@/lib/api/generated/types/getStakeholdersSortOrder';

/** Filters committed from the search gate — table mounts only after Search. */
export interface StakeholderAppliedFilters {
  locationIds?: string[];
  industryIds?: string[];
  clientIds?: string[];
  roleTypeIds?: string[];
  sortBy?: GetStakeholdersSortBy;
  sortOrder?: GetStakeholdersSortOrder;
}

interface SortOption {
  value: string;
  label: string;
  sortBy: GetStakeholdersSortBy;
  sortOrder: GetStakeholdersSortOrder;
}

export const sortByOptions = [
  {
    value: 'alphabetical',
    label: 'Alphabetical (A-Z)',
    sortBy: GetStakeholdersSortBy.fullName,
    sortOrder: GetStakeholdersSortOrder.asc,
  },
  {
    value: 'mostRecentlyContacted',
    label: 'Most Recently Contacted',
    sortBy: GetStakeholdersSortBy.lastContactedAt,
    sortOrder: GetStakeholdersSortOrder.desc,
  },
  {
    value: 'leastRecentlyContacted',
    label: 'Least Recently Contacted',
    sortBy: GetStakeholdersSortBy.lastContactedAt,
    sortOrder: GetStakeholdersSortOrder.asc,
  },
] satisfies SortOption[];

export type SortByValue = (typeof sortByOptions)[number]['value'];
