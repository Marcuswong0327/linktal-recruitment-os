'use client';

import { useCandidates } from './hooks';

export function CandidateList() {
  const { data, isLoading, isError, error } = useCandidates();

  if (isLoading) {
    return <p className="text-sm opacity-70">Loading candidates…</p>;
  }

  if (isError) {
    return <p className="text-sm text-red-500">Failed to load: {error.message}</p>;
  }

  if (!data || data.length === 0) {
    return <p className="text-sm opacity-70">No candidates yet. Add one to get started.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.map((candidate) => (
        <li
          key={candidate.id}
          className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
        >
          <div>
            <p className="font-medium">{candidate.name}</p>
            <p className="text-sm opacity-70">
              {candidate.role} · {candidate.email}
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
