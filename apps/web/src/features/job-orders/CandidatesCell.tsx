'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { getGetJobOrdersQueryKey } from '@/lib/api/generated/job-orders/job-orders';
import {
  getGetSubmissionsQueryKey,
  useCreateSubmission,
  useDeleteSubmission,
} from '@/lib/api/generated/submissions/submissions';
import type { CandidateEntity } from '@/lib/api/generated/types';
import type { JobOrder } from './schema';

/** Collapsed cell text: first name, "+N" for the rest — same shape as the roster in the mockup ("Allan; Jason; John" once expanded, "Allan +2" collapsed). */
export function rosterCellLabel(names: string[]): string {
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

/**
 * The Job Orders sheet's "Candidates" column (2.1/2.2 follow-up, matching
 * the Job Orders Portfolio mockup): a single roster cell instead of separate
 * per-stage columns. Checking a candidate submits them (SUBMITTED);
 * unchecking removes that submission. Per-stage status changes (Submitted →
 * Interviewing → Placed) still happen from the dedicated Job Order page's
 * Submissions card, which already has that control — this cell is purely
 * about who's on the job order, not what stage they're at.
 */
export function CandidatesCell({
  jobOrder,
  candidates,
}: {
  jobOrder: JobOrder;
  candidates: CandidateEntity[];
}) {
  const queryClient = useQueryClient();

  const submissionByCandidateId = React.useMemo(
    () => new Map(jobOrder.pipelineSubmissions.map((s) => [s.candidateId, s])),
    [jobOrder.pipelineSubmissions],
  );
  const selectedIds = React.useMemo(
    () => jobOrder.pipelineSubmissions.map((s) => s.candidateId),
    [jobOrder.pipelineSubmissions],
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() });
  }

  const createSubmission = useCreateSubmission({
    mutation: {
      onSuccess: invalidate,
      onError: (err) => toast.error(err.message || 'Failed to add candidate'),
    },
  });
  const deleteSubmission = useDeleteSubmission({
    mutation: {
      onSuccess: invalidate,
      onError: (err) => toast.error(err.message || 'Failed to remove candidate'),
    },
  });

  function handleValueChange(nextIds: string[]) {
    const nextSet = new Set(nextIds);
    const prevSet = new Set(selectedIds);
    for (const id of nextIds) {
      if (!prevSet.has(id)) {
        createSubmission.mutate({ data: { candidateId: id, jobOrderId: jobOrder.id } });
      }
    }
    for (const id of selectedIds) {
      if (!nextSet.has(id)) {
        const submission = submissionByCandidateId.get(id);
        if (submission) deleteSubmission.mutate({ id: submission.submissionId });
      }
    }
  }

  const candidateById = React.useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const items = React.useMemo(() => candidates.map((c) => c.id), [candidates]);
  // Prefer the submission's own candidateName (always correct, straight from
  // the job order response) over a lookup in `candidates` — that list is
  // fetched with the API's max pageSize (100), and there are already 102+
  // candidates, so an already-submitted person can fall outside that window
  // and wrongly show as "Unknown candidate" even though they exist.
  const labelFor = React.useCallback(
    (id: string) =>
      submissionByCandidateId.get(id)?.candidateName ?? candidateById.get(id)?.fullName ?? 'Unknown candidate',
    [submissionByCandidateId, candidateById],
  );
  const searchTextFor = React.useCallback(
    (id: string) => {
      const candidate = candidateById.get(id);
      return candidate ? `${candidate.fullName} ${candidate.displayId}` : id;
    },
    [candidateById],
  );

  return (
    <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
      <Combobox.Root
        items={items}
        multiple
        value={selectedIds}
        onValueChange={handleValueChange}
        itemToStringLabel={searchTextFor}
        itemToStringValue={(id) => id}
      >
        <Combobox.Trigger className="block w-full truncate text-left text-sm hover:underline">
          {rosterCellLabel(selectedIds.map(labelFor))}
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
            <Combobox.Popup className="w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
              <div className="p-1.5">
                <Combobox.Input
                  placeholder="Search candidates…"
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                />
              </div>
              <Combobox.Empty className="px-3 pb-3 text-center text-sm text-muted-foreground">
                No candidates found.
              </Combobox.Empty>
              <Combobox.List className="max-h-64 overflow-y-auto p-1 pt-0">
                {(id: string) => (
                  <Combobox.Item
                    key={id}
                    value={id}
                    className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Combobox.ItemIndicator
                      keepMounted
                      className={cn(
                        'group flex size-4 shrink-0 items-center justify-center rounded-lg border border-input transition-colors',
                        'data-selected:border-primary data-selected:bg-primary data-selected:text-primary-foreground',
                      )}
                    >
                      <Check className="size-3 opacity-0 group-data-selected:opacity-100" />
                    </Combobox.ItemIndicator>
                    <span className="truncate">{labelFor(id)}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
