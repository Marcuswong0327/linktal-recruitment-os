'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  getGetRoleHistoryQueryKey,
  getGetRolesQueryKey,
  useCreateRole,
  useUpdateRole,
} from '@/lib/api/generated/roles/roles';
import { PermissionPicker } from './PermissionPicker';
import { RoleHistoryPanel } from './RoleHistoryPanel';
import { type Role, isBuiltin, isImmutable } from './schema';

const inputClass =
  'w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60';

/** Create (role === null) or edit a role in a side sheet. */
export function RoleForm({ role, open, onClose }: { role: Role | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        {open && <Body key={role?.id ?? 'new'} role={role} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = role != null;
  const readOnly = role != null && isImmutable(role.name); // admin role
  const nameLocked = role != null && isBuiltin(role.name); // built-ins keep their name

  const [name, setName] = React.useState(role?.name ?? '');
  const [description, setDescription] = React.useState(role?.description ?? '');
  const [permissionIds, setPermissionIds] = React.useState<Set<string>>(
    new Set(role?.permissions.map((p) => p.id) ?? []),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRolesQueryKey() });
    // A save writes a new AuditLog row too (see RolesService.update) — without
    // this, reopening the sheet within the 30s staleTime window shows the
    // version history from before this save, missing the entry just written.
    if (isEdit) queryClient.invalidateQueries({ queryKey: getGetRoleHistoryQueryKey(role.id) });
  };
  const create = useCreateRole();
  const update = useUpdateRole();
  const pending = create.isPending || update.isPending;

  // Editing a role changes what everyone holding it can do, immediately —
  // confirm before committing. Creating a new role has zero holders yet, so
  // nothing to warn about there.
  const [confirmingSave, setConfirmingSave] = React.useState(false);

  function submit() {
    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      permissionIds: [...permissionIds],
    };
    const onSuccess = () => {
      invalidate();
      toast.success(isEdit ? 'Role updated' : 'Role created');
      onClose();
    };
    const onError = (e: { message?: string }) => toast.error(e.message ?? 'Something went wrong');

    if (isEdit) update.mutate({ id: role.id, data }, { onSuccess, onError });
    else create.mutate({ data }, { onSuccess, onError });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="capitalize">{isEdit ? role.name : 'Create New Role'}</SheetTitle>
        <SheetDescription>
          {readOnly
            ? 'The admin role is immutable and cannot be changed.'
            : 'Name, description, and the permissions this role grants.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 px-4">
        <div className="space-y-1.5">
          <Label htmlFor="role-name">Name</Label>
          <input
            id="role-name"
            className={cn(inputClass, 'capitalize')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly || nameLocked}
            placeholder="e.g. contractor"
          />
          {nameLocked && !readOnly && (
            <p className="text-xs text-muted-foreground">Built-in role names can’t be changed.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role-desc">Description</Label>
          <input
            id="role-desc"
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
            placeholder="What this role is for"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Permissions</Label>
          <PermissionPicker value={permissionIds} onChange={setPermissionIds} disabled={readOnly} />
        </div>

        {isEdit ? (
          <div className="space-y-1.5">
            <Label>Version history</Label>
            {/* A restore lands via the mutation, not local state — closing
                here (like a normal save) avoids this form's own name/
                description/permissionIds state going stale against it. */}
            <RoleHistoryPanel roleId={role.id} readOnly={readOnly} onRestored={onClose} />
          </div>
        ) : null}
      </div>

      <SheetFooter>
        <Button variant="outline" onClick={onClose}>
          {readOnly ? 'Close' : 'Cancel'}
        </Button>
        {!readOnly && (
          <Button
            onClick={() => (isEdit ? setConfirmingSave(true) : submit())}
            disabled={pending || !name.trim()}
          >
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create role'}
          </Button>
        )}
      </SheetFooter>

      {isEdit && (
        <AlertDialog open={confirmingSave} onOpenChange={setConfirmingSave}>
          <AlertDialogContent>
            <AlertDialogHeader icon={AlertTriangle} iconVariant="warning">
              <AlertDialogTitle>Save changes to “{role.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {role.consultantCount > 0
                  ? `This updates permissions for ${role.consultantCount} consultant${role.consultantCount === 1 ? '' : 's'} currently assigned this role, effective immediately.`
                  : 'No consultants currently hold this role, so this won’t affect anyone yet.'}{' '}
                This can’t be reverted from Version history — review the changes before saving.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={() => {
                  setConfirmingSave(false);
                  submit();
                }}
              >
                {pending ? 'Saving…' : 'Save changes'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
