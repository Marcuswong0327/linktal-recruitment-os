# UX Patterns

Reusable interaction patterns for the web app (`apps/web`), factored out once
they showed up in enough places to be worth naming. Currently just one:
delete confirmation + undo.

---

## 1. Delete: confirm, then undo

Every destructive delete in the app follows the same two-layer shape:

1. **Confirm** — an `AlertDialog` asking "are you sure?" before anything
   happens. Stops a misclick.
2. **Undo** — after confirming, a toast with an **Undo** action. Covers a
   changed mind *after* confirming, which a dialog can't.

These are layered, not alternatives — skipping either one leaves a gap
(no confirm = one misclick destroys data; no undo = "are you sure?" is the
only recovery path, and recovery from *inside* the dialog isn't a thing).

### The two pieces

| Piece | File | What it does |
|---|---|---|
| `ConfirmDeleteDialog` | `apps/web/src/components/ConfirmDeleteDialog.tsx` | The `AlertDialog` shell — title, description, Cancel/Delete. Every table in the app was reimplementing this inline; this is just that, factored out. |
| `deleteWithUndo` | `apps/web/src/lib/delete-with-undo.ts` | Fires the toast, runs the grace-window timer, and calls the right delete/restore function depending on mode (below). Not a hook — an imperative function you call from a confirmed-delete handler. |

Usage shape (see `apps/web/src/features/stakeholders/StakeholdersTable.tsx`
for a full example — bulk delete with delayed mode):

```tsx
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

function handleDelete() {
  setDeleteConfirmOpen(false);
  deleteWithUndo({
    label: 'stakeholder', // or `${n} stakeholders` for a bulk action
    deleteFn: () => deleteStakeholder(id),
    onCommitted: () => queryClient.invalidateQueries(...),
    onUndo: () => queryClient.invalidateQueries(...),
  });
}

<ConfirmDeleteDialog
  open={deleteConfirmOpen}
  onOpenChange={setDeleteConfirmOpen}
  title="Delete this stakeholder?"
  description="You can undo this from the toast right after, or it's gone for good."
  onConfirm={handleDelete}
/>
```

### Two undo modes

`deleteWithUndo` picks its mode based on whether you pass `restoreFn`:

- **Restore mode** (`restoreFn` provided) — the delete fires immediately;
  Undo calls `restoreFn`. Use this when the entity has a real backend
  restore endpoint (soft delete + `POST :id/restore`).
- **Delayed mode** (no `restoreFn`) — nothing is sent to the server until
  the toast's grace window (default 5s) elapses with no Undo click; Undo
  just cancels the pending call. This is how "Undo" can be *real* — not
  cosmetic — for entities the API has no way to reverse.

Which mode an entity uses is a fact about the backend, not a UI choice:

| Entity | Restore endpoint? | Mode |
|---|---|---|
| Candidate | Yes (`POST /candidates/:id/restore`) | Restore |
| Client | Yes | Restore |
| TOB | Yes | Restore |
| Job Research | Yes | Restore |
| Stakeholder | No | Delayed |
| Job Order | No | Delayed |
| Submission | No | Delayed |
| Interview | No | Delayed |
| Role | No | *(see exception below)* |
| Placement | No | Delayed |

If a restore endpoint gets added for an entity currently on delayed mode,
switch its call site to pass `restoreFn` — the delete becomes immediate and
Undo becomes a real reversal instead of a cancelled timer.

### Exception: Roles

`RolesTable` + `DeleteRoleSheet` (`apps/web/src/features/roles/`) confirm via
a `Sheet` flow, not `AlertDialog` — deleting a role that still has consultants
assigned needs to collect a reassignment target first, which a yes/no dialog
can't do. That's staying as-is. No undo either: reassignment already happened
as part of the delete, so a delayed/cancelled-timer undo wouldn't actually be
reversible, and there's no restore endpoint to fall back on.

### Known gap: Candidates

`apps/web/src/features/candidates/` (`CandidateRowActions.tsx`,
`CandidatesTable.tsx`, `CandidateDetail.tsx`'s note delete) is **not yet**
on this pattern. The candidate row delete already has real restore-backed
undo (`useDeleteCandidate` + `useRestoreCandidate`) but no confirm dialog;
the bulk delete has confirm but no undo. Both should move onto
`ConfirmDeleteDialog` + `deleteWithUndo` (restore mode — Candidate has a
real restore endpoint).

They're deferred rather than fixed alongside everything else above because
the whole Candidates feature is currently sitting on a stale generated API
client (`apps/web/src/lib/api/generated/candidates`) — `candidate.fullName`
and several other fields the code references don't exist on the real
`CandidateEntity` anymore, so the files already fail `tsc --noEmit` for
unrelated reasons. Folding delete-confirm+undo in now would mean either
building on top of code that doesn't compile, or absorbing the whole
Candidates API-client migration as a side effect. That migration is real,
scoped separately, and should land first — then apply this pattern to
Candidates as part of (or immediately after) that work.
