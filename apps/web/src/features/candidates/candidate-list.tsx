'use client';

import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';

export function CandidateList() {
  const { data, isLoading, isError, error } = useGetCandidates();

  if (isLoading) {
    return <p className="text-sm opacity-70">Loading candidates…</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-red-500">
        Failed to load: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  // Response is a discriminated union by status; customFetch throws on non-2xx,
  // so a resolved query is always the 200 payload. The list is now a paginated
  // envelope: { data, total, page, pageSize, pageCount }.
  const candidates = data?.status === 200 ? data.data.data : [];

  if (candidates.length === 0) {
    return (
      <p className="text-sm opacity-70">
        No candidates yet. Add one to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {candidates.map((candidate) => (
        <li
          key={candidate.id}
          className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
        >
          <div>
            <p className="font-medium">{candidate.fullName}</p>
            <p className="text-sm opacity-70">
              {[candidate.currentPosition, candidate.email]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <span className="rounded-full border border-black/15 px-2.5 py-0.5 text-xs font-medium dark:border-white/20">
            {candidate.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
