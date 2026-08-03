'use client';

import { keepPreviousData, useMutation, useQuery, type QueryFunction } from '@tanstack/react-query';
import { customFetch } from '@/lib/api/fetcher';
import type {
  CreateContactHistoryPayload,
  CreateStakeholderPayload,
  JobTitle,
  PaginatedStakeholders,
  Stakeholder,
  StakeholderContactHistory,
  StakeholderQueryParams,
  StakeholderRoleType,
  UpdateStakeholderPayload,
} from './schema';

type Envelope<T> = { data: T; status: number; headers: Headers };

function toQueryString(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) usp.append(key, String(v));
    } else {
      usp.append(key, String(value));
    }
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export const STAKEHOLDERS_QUERY_KEY = ['/stakeholders'] as const;

export function getStakeholders(params: StakeholderQueryParams, options?: RequestInit) {
  return customFetch<Envelope<PaginatedStakeholders>>(`/stakeholders${toQueryString(params as unknown as Record<string, unknown>)}`, {
    ...options,
    method: 'GET',
  });
}

export function useGetStakeholders(params: StakeholderQueryParams) {
  const queryKey = [...STAKEHOLDERS_QUERY_KEY, params] as const;
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getStakeholders>>> = ({ signal }) =>
    getStakeholders(params, { signal });
  return useQuery({ queryKey, queryFn, placeholderData: keepPreviousData });
}

export function createStakeholder(data: CreateStakeholderPayload) {
  return customFetch<Envelope<Stakeholder>>('/stakeholders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function useCreateStakeholder(options?: {
  onSuccess?: (data: Awaited<ReturnType<typeof createStakeholder>>) => void;
  onError?: (err: Error) => void;
}) {
  return useMutation({
    mutationFn: (data: CreateStakeholderPayload) => createStakeholder(data),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function updateStakeholder(id: string, data: UpdateStakeholderPayload) {
  return customFetch<Envelope<Stakeholder>>(`/stakeholders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function useUpdateStakeholder(options?: {
  onSuccess?: (data: Awaited<ReturnType<typeof updateStakeholder>>, variables: { id: string; data: UpdateStakeholderPayload }) => void;
  onError?: (err: Error) => void;
}) {
  return useMutation({
    mutationFn: (variables: { id: string; data: UpdateStakeholderPayload }) =>
      updateStakeholder(variables.id, variables.data),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

export function deleteStakeholder(id: string) {
  return customFetch<Envelope<void>>(`/stakeholders/${id}`, { method: 'DELETE' });
}

export function addStakeholderContactHistory(id: string, data: CreateContactHistoryPayload) {
  return customFetch<Envelope<StakeholderContactHistory>>(`/stakeholders/${id}/contact-history`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function useAddStakeholderContactHistory(options?: {
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}) {
  return useMutation({
    mutationFn: (variables: { id: string; data: CreateContactHistoryPayload }) =>
      addStakeholderContactHistory(variables.id, variables.data),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });
}

// JobTitle catalog (apps/api/src/job-titles) — search-gated, no existing
// frontend client (never wired up before this page). `take: 200` (the
// backend's max) approximates "give me the whole catalog" for the combobox,
// same known limitation as the consultant/client lookups elsewhere in this
// codebase that fetch one large capped page instead of paginating a picker.
export function getJobTitles() {
  return customFetch<Envelope<JobTitle[]>>('/job-titles?take=200', { method: 'GET' });
}

export function useGetJobTitles() {
  return useQuery({
    queryKey: ['/job-titles'] as const,
    queryFn: () => getJobTitles(),
  });
}

export function createJobTitle(name: string) {
  return customFetch<Envelope<JobTitle>>('/job-titles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// StakeholderRoleType catalog — the generated client's useGetStakeholderRoleTypes
// (src/lib/api/generated/stakeholder-role-types) predates
// QueryStakeholderRoleTypesDto's `q`/`take` params entirely: its URL builder
// takes no arguments at all, so every call silently gets the backend's
// default `take: 50`. Any role type past the 50th (alphabetically —
// findAll orders by name) never comes back, so a stakeholder referencing one
// can't be resolved against the fetched catalog (shows as "Uncategorized",
// uncolored, despite having a real role type). `take: 200` (the backend's
// max) is the same known-limitation workaround as job titles above.
export function getStakeholderRoleTypes() {
  return customFetch<Envelope<StakeholderRoleType[]>>('/stakeholder-role-types?take=200', {
    method: 'GET',
  });
}

export function useGetStakeholderRoleTypesFull() {
  return useQuery({
    queryKey: ['/stakeholder-role-types', 'full'] as const,
    queryFn: () => getStakeholderRoleTypes(),
  });
}
