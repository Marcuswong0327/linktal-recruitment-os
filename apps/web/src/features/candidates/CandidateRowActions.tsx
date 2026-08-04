'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Phone, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import {
  getGetCandidatesQueryKey,
  useDeleteCandidate,
  useRestoreCandidate,
} from '@/lib/api/generated/candidates/candidates';
import { candidateFullName, type Candidate } from './schema';

/**
 * Per-row actions: log a contact (always available — the backend enforces
 * `candidate:update`, same as every other inline edit in this app; there's
 * no separate frontend permission gate) and delete (soft, only when
 * `canDelete`). Delete confirms first, then fires via deleteWithUndo's
 * restore mode — Candidate has a real soft-delete/restore endpoint, so
 * "Undo" is a genuine reversal, not a cancelled timer.
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
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  // No params → the base list key; invalidates every candidates page/filter.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });

  const remove = useDeleteCandidate();
  const restore = useRestoreCandidate();

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation(); // don't trigger the row's navigation
    setConfirmingDelete(true);
  }

  function handleConfirmDelete() {
    setConfirmingDelete(false);
    const name = candidateFullName(candidate) || 'this candidate';
    deleteWithUndo({
      label: name,
      deleteFn: () => remove.mutateAsync({ id: candidate.id }),
      restoreFn: () => restore.mutateAsync({ id: candidate.id }),
      onCommitted: invalidate,
      onUndo: invalidate,
    });
  }

  function handleLogContact(event: React.MouseEvent) {
    event.stopPropagation(); // don't trigger the row's navigation
    onLogContact(candidate);
  }

  const name = candidateFullName(candidate) || 'this candidate';

  return (
    <div className="flex items-center justify-center gap-1" data-no-row-drag>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLogContact}
        aria-label={`Log a contact with ${name}`}
        title="Log a contact"
      >
        <Phone className="text-muted-foreground" />
      </Button>
      {canDelete ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={remove.isPending}
            aria-label={`Delete ${name}`}
            title="Delete candidate"
          >
            {remove.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Trash2 className="text-muted-foreground" />
            )}
          </Button>
          <div onClick={(e) => e.stopPropagation()}>
            <ConfirmDeleteDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              title={`Delete ${name}?`}
              description="Archived (soft delete) — you can undo this from the toast right after."
              onConfirm={handleConfirmDelete}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
