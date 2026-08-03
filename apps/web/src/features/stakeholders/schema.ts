// The generated API client (src/lib/api/generated) is stale relative to the
// current backend — apps/api/src/stakeholders/entities/stakeholder.entity.ts
// has firstName/lastName (not fullName), isAccurate/inaccurateReason and a
// coverage/coverageLocationIds location arm (not isDecisionMaker/notes), and
// jobTitleId is a JobTitle catalog reference (not free text). Regenerating
// the client would fix this but also surfaces the same staleness in
// Candidates/Job Orders, which is a separate, larger migration — out of
// scope here. So these types are hand-mirrored from the real Nest DTOs/
// entities instead of reusing the generated (wrong) ones; API calls go
// through features/stakeholders/api.ts, which talks to `customFetch`
// directly rather than the generated stakeholders hooks.

export interface Stakeholder {
  id: string;
  displayId: string;
  clientId: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitleId: string | null;
  jobTitle: string | null;
  stakeholderRoleTypeId: string | null;
  roleType: string | null;
  linkedinUrl: string | null;
  email: string | null;
  mobile: string | null;
  coverage: string[];
  coverageLocationIds: string[];
  lastContactedAt: string | null;
  lastContactedById: string | null;
  lastContactType: string | null;
  lastContactCategory: string | null;
  lastContactNotes: string | null;
  lastContactedBy: string | null;
  isAccurate: boolean | null;
  inaccurateReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedStakeholders {
  data: Stakeholder[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Mirrors CreateStakeholderDto (apps/api/src/stakeholders/dto/create-stakeholder.dto.ts). */
export interface CreateStakeholderPayload {
  clientId: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitleId?: string | null;
  roleTypeId?: string | null;
  linkedinUrl?: string | null;
  email?: string | null;
  mobile?: string | null;
  coverageLocationIds?: string[];
  isAccurate?: boolean | null;
  inaccurateReason?: string | null;
}

/** Mirrors UpdateStakeholderDto — PartialType(CreateStakeholderDto), plus re-parenting. */
export type UpdateStakeholderPayload = Partial<CreateStakeholderPayload>;

export enum StakeholderSortField {
  displayId = 'displayId',
  firstName = 'firstName',
  lastName = 'lastName',
  createdAt = 'createdAt',
  lastContactedAt = 'lastContactedAt',
}

export type SortOrder = 'asc' | 'desc';

/** Mirrors QueryStakeholdersDto. */
export interface StakeholderQueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: StakeholderSortField;
  sortOrder?: SortOrder;
  q?: string;
  clientId?: string;
  clientIds?: string[];
  jobTitle?: string;
  roleTypeIds?: string[];
  jobTitleIds?: string[];
}

export interface StakeholderContactHistory {
  id: string;
  displayId: string;
  stakeholderId: string;
  contactType: string | null;
  category: string | null;
  contactedById: string | null;
  notes: string | null;
  contactedAt: string;
  createdAt: string;
}

/** Mirrors CreateStakeholderContactHistoryDto — unaffected by the drift above. */
export interface CreateContactHistoryPayload {
  contactType: string;
  notes?: string;
  category?: string;
  contactedAt?: string;
}

/** Mirrors apps/api/src/job-titles/entities/job-title.entity.ts. */
export interface JobTitle {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors apps/api/src/stakeholder-role-types/entities/stakeholder-role-type.entity.ts. */
export interface StakeholderRoleType {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Helper for display — the entity has no combined name field, by design (see firstName/lastName above). */
export function stakeholderFullName(s: Pick<Stakeholder, 'firstName' | 'lastName'>): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ');
}
