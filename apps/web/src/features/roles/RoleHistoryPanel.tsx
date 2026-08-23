'use client';

import * as React from 'react';
import { History, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGetPermissions } from '@/lib/api/generated/permissions/permissions';
import {
  getGetRoleHistoryQueryKey,
  getGetRolesQueryKey,
  useGetRoleHistory,
  useRestoreRole,
} from '@/lib/api/generated/roles/roles';
import type { RoleHistoryEntryEntity } from '@/lib/api/generated/types';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const actionLabels: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
};

// How many permission labels to list per added/removed/baseline group before
// collapsing the rest into "+N more" — a full admin-role grant is 60+
// permissions and would otherwise blow out the sheet.
const MAX_LISTED_PERMISSIONS = 6;

type PermissionsMode =
  | 'diff' // both this row and the one before it captured a set — a real add/remove diff
  | 'baseline' // the CREATE row — nothing to diff against, this *is* the starting set
  | 'unknown' // this row captured a set but there's no earlier one to diff against (page truncated, or the previous save didn't touch permissions)
  | 'unchanged'; // this row didn't capture a set at all — that save left permissions alone

interface EntryDiff {
  nameChange: { from: string | null; to: string | null } | null;
  descriptionChanged: boolean;
  permissionsAdded: string[];
  permissionsRemoved: string[];
  permissionsMode: PermissionsMode;
}

/**
 * Compares one saved version against the version immediately before it
 * (`older` — chronologically previous, i.e. the *next* entry in the
 * newest-first array) so each row can show what actually changed, not just
 * its resulting state. `older` is undefined for the oldest row currently
 * loaded — either because it's the CREATE row (nothing came before it) or
 * because `limit` cut the page off before reaching one.
 */
function diffEntry(entry: RoleHistoryEntryEntity, older: RoleHistoryEntryEntity | undefined): EntryDiff {
  const nameChange = older && entry.name !== older.name ? { from: older.name, to: entry.name } : null;
  const descriptionChanged = !!older && entry.description !== older.description;

  if (entry.permissionIds == null) {
    return { nameChange, descriptionChanged, permissionsAdded: [], permissionsRemoved: [], permissionsMode: 'unchanged' };
  }
  if (!older || older.permissionIds == null) {
    return {
      nameChange,
      descriptionChanged,
      permissionsAdded: entry.permissionIds,
      permissionsRemoved: [],
      permissionsMode: entry.action === 'CREATE' ? 'baseline' : 'unknown',
    };
  }
  const olderIds = new Set(older.permissionIds);
  const currentIds = new Set(entry.permissionIds);
  return {
    nameChange,
    descriptionChanged,
    permissionsAdded: entry.permissionIds.filter((id) => !olderIds.has(id)),
    permissionsRemoved: older.permissionIds.filter((id) => !currentIds.has(id)),
    permissionsMode: 'diff',
  };
}

/** Comma-joined permission labels, capped with a "+N more" tail so a 60-permission grant doesn't blow out the sheet. */
function listLabels(ids: string[], labelFor: (id: string) => string): string {
  const shown = ids.slice(0, MAX_LISTED_PERMISSIONS).map(labelFor);
  const rest = ids.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, +${rest} more` : shown.join(', ');
}

function DiffSummary({ diff, labelFor }: { diff: EntryDiff; labelFor: (id: string) => string }) {
  const lines: React.ReactNode[] = [];

  if (diff.nameChange) {
    lines.push(
      <p key="name">
        Renamed <span className="text-muted-foreground">"{diff.nameChange.from ?? '—'}"</span> →{' '}
        <span className="font-medium">"{diff.nameChange.to ?? '—'}"</span>
      </p>,
    );
  }
  if (diff.descriptionChanged) {
    lines.push(<p key="desc">Description changed</p>);
  }

  if (diff.permissionsMode === 'baseline') {
    lines.push(
      <p key="perm">
        Granted {diff.permissionsAdded.length} permission{diff.permissionsAdded.length === 1 ? '' : 's'}:{' '}
        {listLabels(diff.permissionsAdded, labelFor)}
      </p>,
    );
  } else if (diff.permissionsMode === 'unknown') {
    lines.push(
      <p key="perm" className="italic">
        {diff.permissionsAdded.length} permission{diff.permissionsAdded.length === 1 ? '' : 's'} as of this save —
        earlier history not loaded, so no diff to show
      </p>,
    );
  } else if (diff.permissionsMode === 'unchanged') {
    lines.push(
      <p key="perm" className="italic">
        Permissions unchanged
      </p>,
    );
  } else if (diff.permissionsAdded.length === 0 && diff.permissionsRemoved.length === 0) {
    lines.push(
      <p key="perm" className="italic">
        No permission changes
      </p>,
    );
  } else {
    if (diff.permissionsAdded.length > 0) {
      lines.push(
        <p key="added" className="text-success">
          + {listLabels(diff.permissionsAdded, labelFor)}
        </p>,
      );
    }
    if (diff.permissionsRemoved.length > 0) {
      lines.push(
        <p key="removed" className="text-destructive">
          − {listLabels(diff.permissionsRemoved, labelFor)}
        </p>,
      );
    }
  }

  if (lines.length === 0) {
    return <p className="italic text-muted-foreground">No changes recorded</p>;
  }
  return <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">{lines}</div>;
}

/**
 * Every past save of this role, newest first — reshaped server-side from its
 * own AuditLog rows rather than a dedicated versioning table (see
 * RoleHistoryEntryEntity's doc): each row is already a complete,
 * name/description/permissions snapshot, not a diff. The diffing against the
 * previous entry happens here, client-side, since the backend already hands
 * over everything needed (full permissionIds per row) and the permission
 * catalog for resolving labels is already fetched elsewhere in this feature
 * (PermissionPicker). The first row is always the role's current state, so
 * it's shown without a Restore action.
 *
 * A restore is just another audited edit, not a destructive revert — nothing
 * here is deleted, so closing and reopening this panel after one shows the
 * restored state as the new "current" entry plus a fresh UPDATE row on top.
 */
export function RoleHistoryPanel({
  roleId,
  readOnly,
  onRestored,
}: {
  roleId: string;
  /** The admin role's history is still worth seeing, just never restorable. */
  readOnly: boolean;
  /** Called after a successful restore — the caller's local form state (seeded from the role at open time) is now stale. */
  onRestored: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetRoleHistory(roleId);
  const entries = data?.status === 200 ? data.data : [];

  const { data: permissionsData } = useGetPermissions();
  const permissions = permissionsData?.status === 200 ? permissionsData.data : [];
  const labelById = React.useMemo(
    () => new Map(permissions.map((p) => [p.id, `${p.resource}:${p.action}`])),
    [permissions],
  );
  const labelFor = React.useCallback((id: string) => labelById.get(id) ?? id, [labelById]);

  const [confirming, setConfirming] = React.useState<RoleHistoryEntryEntity | null>(null);

  const restore = useRestoreRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRolesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRoleHistoryQueryKey(roleId) });
        toast.success('Role restored');
        setConfirming(null);
        onRestored();
      },
      onError: (err) => toast.error(err.message || 'Failed to restore role'),
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading version history…</p>;
  }
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved versions yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {entries.map((entry, i) => {
          const isCurrent = i === 0;
          const diff = diffEntry(entry, entries[i + 1]);
          // A name/description-only save has no permissionIds snapshot —
          // there's nothing complete to roll back to (see the API's
          // NOT_RESTORABLE doc on RolesService.restore).
          const restorable = !isCurrent && !readOnly && entry.permissionIds != null;
          return (
            <li key={entry.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{actionLabels[entry.action] ?? entry.action}</span>
                    {isCurrent ? (
                      <Badge variant="muted" className="shrink-0">
                        Current
                      </Badge>
                    ) : null}
                    {!isCurrent && entry.permissionIds == null ? (
                      <span
                        className="shrink-0 text-[10px] text-muted-foreground"
                        title="This save only changed the name/description — no permission snapshot to restore."
                      >
                        not restorable
                      </span>
                    ) : null}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.actorName ?? 'Imported/system'} · {dateFormatter.format(new Date(entry.createdAt))}
                  </span>
                </div>
                {restorable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setConfirming(entry)}
                  >
                    <RotateCcw />
                    Restore
                  </Button>
                ) : null}
              </div>
              <DiffSummary diff={diff} labelFor={labelFor} />
            </li>
          );
        })}
      </ul>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader icon={History}>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming
                ? `This replaces the current name, description, and ${confirming.permissionIds?.length ?? 0} permission${confirming.permissionIds?.length === 1 ? '' : 's'} with the version saved ${dateFormatter.format(new Date(confirming.createdAt))} by ${confirming.actorName ?? 'Imported/system'}. Nothing is deleted — this is itself saved as a new version, so you can always restore back.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={() => confirming && restore.mutate({ id: roleId, data: { auditLogId: confirming.id } })}
            >
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
