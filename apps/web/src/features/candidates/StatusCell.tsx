'use client';

import { Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { badgeVariants } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useUpdateCandidate,
  getGetCandidatesQueryKey,
  getGetCandidateQueryKey,
} from '@/lib/api/generated/candidates/candidates';
import {
  candidateFullName,
  type Candidate,
  candidateStatuses,
  candidateStatusLabels,
  candidateStatusVariants,
} from './schema';

/**
 * Inline status editor for the candidates grid: the status pill opens a menu
 * of statuses and PATCHes just that field — no need to open the detail page.
 */
export function CandidateStatusCell({ candidate }: { candidate: Candidate }) {
  const queryClient = useQueryClient();

  const updateStatus = useUpdateCandidate({
    mutation: {
      onSuccess: (_result, { data }) => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetCandidateQueryKey(candidate.id),
        });
        toast.success(
          `${candidateFullName(candidate) || 'Candidate'} marked ${candidateStatusLabels[data.status ?? candidate.status]}`,
        );
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to update status');
      },
    },
  });

  return (
    // The grid row navigates on click; keep pill clicks inside the cell.
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={updateStatus.isPending}
          className={cn(
            badgeVariants({ variant: candidateStatusVariants[candidate.status] }),
            'cursor-pointer disabled:opacity-50',
          )}
        >
          {candidateStatusLabels[candidate.status]}
          <ChevronDown className="size-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {candidateStatuses.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => {
                if (status !== candidate.status) {
                  updateStatus.mutate({ id: candidate.id, data: { status } });
                }
              }}
            >
              <span className={badgeVariants({ variant: candidateStatusVariants[status] })}>
                {candidateStatusLabels[status]}
              </span>
              {status === candidate.status ? <Check className="ml-auto size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
