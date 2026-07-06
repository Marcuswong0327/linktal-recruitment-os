'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Candidate, CreateCandidateInput } from './schema';

const candidatesKey = ['candidates'] as const;

export function useCandidates() {
  return useQuery({
    queryKey: candidatesKey,
    queryFn: () => apiFetch<Candidate[]>('/candidates'),
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCandidateInput) =>
      apiFetch<Candidate>('/candidates', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: candidatesKey });
    },
  });
}
