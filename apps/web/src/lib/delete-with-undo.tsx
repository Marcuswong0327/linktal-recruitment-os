import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';

/** Shared action-button contents for every "Undo" toast in the app — icon + label, one definition so they all match. */
export const undoLabel = (
  <>
    <Undo2 />
    Undo
  </>
);

interface DeleteWithUndoOptions {
  /** What the toast calls it, e.g. "candidate" or "3 stakeholders". */
  label: string;
  /** Performs the actual delete call. In "delayed" mode (no `restoreFn`) this only fires after the grace window elapses; in "restore" mode it fires immediately. */
  deleteFn: () => Promise<unknown>;
  /**
   * Reverses the delete. Pass this for entities with a real backend restore
   * endpoint (Candidates, Clients, TOBs, Job Research as of writing) — the
   * delete commits right away and Undo calls this. Omit it for everything
   * else: the delete is deferred by `graceMs` instead, and Undo just cancels
   * the pending call, so "Undo" is still exactly reversible even with no
   * restore endpoint to call.
   */
  restoreFn?: () => Promise<unknown>;
  /** Runs once the delete has actually committed (immediately in "restore" mode, after the grace window in "delayed" mode) — e.g. invalidate a query. */
  onCommitted?: () => void;
  /** Runs if the user clicks Undo — e.g. invalidate a query so a restored/never-deleted row reappears. */
  onUndo?: () => void;
  /** Runs if the (immediate, "restore"-mode) delete call itself fails. Not called in "delayed" mode, since nothing was sent to the server to fail. */
  onError?: (err: unknown) => void;
  /** How long the undo window stays open, in ms. Only meaningful in "delayed" mode — "restore" mode's toast just uses sonner's default duration. */
  graceMs?: number;
}

/**
 * Confirmation (see `ConfirmDeleteDialog`) answers "are you sure" up front;
 * this answers "I changed my mind" after the fact, via a toast Undo action —
 * the two are layered, not alternatives. Two modes, chosen by whether
 * `restoreFn` is passed:
 *
 * - **restore mode**: delete fires immediately; Undo calls `restoreFn`. Use
 *   for entities with a real backend restore endpoint.
 * - **delayed mode**: delete is deferred until `graceMs` elapses with no
 *   Undo click; Undo just cancels it. Use for everything else — this is how
 *   "Undo" can be real (not cosmetic) for entities the API can't reverse.
 */
export function deleteWithUndo({
  label,
  deleteFn,
  restoreFn,
  onCommitted,
  onUndo,
  onError,
  graceMs = 5000,
}: DeleteWithUndoOptions): void {
  if (restoreFn) {
    deleteFn()
      .then(() => {
        onCommitted?.();
        toast.success(`Deleted ${label}`, {
          action: {
            label: undoLabel,
            onClick: () => {
              restoreFn()
                .then(() => {
                  onUndo?.();
                  toast.success(`Restored ${label}`);
                })
                .catch((err) =>
                  toast.error(err instanceof Error ? err.message : `Failed to restore ${label}`),
                );
            },
          },
        });
      })
      .catch((err) => {
        onError?.(err);
        toast.error(err instanceof Error ? err.message : `Failed to delete ${label}`);
      });
    return;
  }

  // Delayed mode — nothing hits the server until the toast's own duration
  // timer runs out. `committed` guards against onAutoClose firing after an
  // Undo click already handled it (dismissing a toast still lets its timer
  // finish this tick), and against ever double-committing.
  let committed = false;
  const toastId = toast(`Deleted ${label}`, {
    duration: graceMs,
    action: {
      label: undoLabel,
      onClick: () => {
        if (committed) return;
        committed = true;
        toast.dismiss(toastId);
        onUndo?.();
      },
    },
    onAutoClose: () => {
      if (committed) return;
      committed = true;
      deleteFn()
        .then(() => onCommitted?.())
        .catch((err) => {
          onUndo?.(); // the delete never actually landed — put it back
          onError?.(err);
          toast.error(err instanceof Error ? err.message : `Failed to delete ${label}`);
        });
    },
  });
}
