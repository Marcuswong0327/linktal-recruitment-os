'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Phone, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  getGetCandidatesQueryKey,
  useDeleteCandidate,
  useRestoreCandidate,
} from '@/lib/api/generated/candidates/candidates';
import type { Candidate } from './schema';

/**
 * Per-row actions: log a contact (always available — the backend enforces
 * `candidate:update`, same as every other inline edit in this app; there's
 * no separate frontend permission gate) and delete (soft, only when
 * `canDelete`). Delete surfaces an "Undo" in the success toast that restores
 * the row — the quickest way to exercise the soft-delete/restore round-trip
 * without a separate deleted view.
 */
export function CandidateRowActions({
  candidate,
  canDelete = true,
  onLogContact,
}: {
  candidate: Candidate;
  canDelete?: boolean;
  onLogContact: (candidate: Candidate) => void;
}) {
  const queryClient = useQueryClient();
  // No params → the base list key; invalidates every candidates page/filter.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });

  const remove = useDeleteCandidate();
  const restore = useRestoreCandidate();

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation(); // don't trigger the row's navigation
    remove.mutate(
      { id: candidate.id },
      {
        onSuccess: () => {
          invalidate();
          toast.success(`Deleted ${candidate.fullName}`, {
            description: 'Archived (soft delete) — recoverable.',
            action: {
              label: 'Undo',
              onClick: () =>
                restore.mutate(
                  { id: candidate.id },
                  {
                    onSuccess: () => {
                      invalidate();
                      toast.success(`Restored ${candidate.fullName}`);
                    },
                    onError: () => toast.error(`Couldn't restore ${candidate.fullName}`),
                  },
                ),
            },
          });
        },
        onError: () => toast.error(`Couldn't delete ${candidate.fullName}`),
      },
    );
  }

  function handleLogContact(event: React.MouseEvent) {
    event.stopPropagation(); // don't trigger the row's navigation
    onLogContact(candidate);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLogContact}
        aria-label={`Log a contact with ${candidate.fullName}`}
        title="Log a contact"
      >
        <Phone className="text-muted-foreground" />
      </Button>
      {canDelete ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={remove.isPending}
          aria-label={`Delete ${candidate.fullName}`}
          title="Delete candidate"
        >
          {remove.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 className="text-muted-foreground" />
          )}
        </Button>
      ) : null}
    </div>
  );
}
