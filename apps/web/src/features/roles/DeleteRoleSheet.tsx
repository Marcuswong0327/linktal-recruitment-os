'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EnumSelect } from '@/components/EnumSelect';
import { deleteRole, getGetRolesQueryKey } from '@/lib/api/generated/roles/roles';
import { getGetConsultantsQueryKey } from '@/lib/api/generated/consultants/consultants';
import type { Role } from './schema';

/**
 * Confirm-delete for a custom role. If consultants still hold it, the admin must
 * pick a fallback role to move them to first (handled server-side in one call).
 */
export function DeleteRoleSheet({
  role,
  allRoles,
  open,
  onClose,
}: {
  role: Role | null;
  allRoles: Role[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        {role && <Body key={role.id} role={role} allRoles={allRoles} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ role, allRoles, onClose }: { role: Role; allRoles: Role[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const hasHolders = role.consultantCount > 0;
  const options = allRoles
    .filter((r) => r.id !== role.id)
    .map((r) => ({ value: r.id, label: r.name }));

  const [reassignTo, setReassignTo] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function confirm() {
    if (hasHolders && !reassignTo) return;
    setPending(true);
    try {
      await deleteRole(role.id, hasHolders ? { reassignTo } : {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetRolesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetConsultantsQueryKey() }),
      ]);
      toast.success(`Deleted role “${role.name}”`);
      onClose();
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'Could not delete the role');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Delete “{role.name}”?</SheetTitle>
        <SheetDescription>
          {hasHolders
            ? `${role.consultantCount} consultant${role.consultantCount === 1 ? '' : 's'} currently ${
                role.consultantCount === 1 ? 'has' : 'have'
              } this role. Choose a role to move ${
                role.consultantCount === 1 ? 'them' : 'them'
              } to — they'll take on that role's permissions.`
            : 'This role has no consultants and will be permanently deleted.'}
        </SheetDescription>
      </SheetHeader>

      <div className="mx-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>This is permanent and can’t be undone — there’s no restore for a deleted role.</span>
      </div>

      {hasHolders && (
        <div className="space-y-1.5 px-4">
          <Label htmlFor="reassign-to">Reassign consultants to</Label>
          <EnumSelect
            id="reassign-to"
            value={reassignTo}
            onValueChange={setReassignTo}
            options={options}
            placeholder="Choose a role…"
          />
        </div>
      )}

      <SheetFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={confirm}
          disabled={pending || (hasHolders && !reassignTo)}
        >
          {pending ? 'Deleting…' : hasHolders ? 'Reassign & delete' : 'Delete role'}
        </Button>
      </SheetFooter>
    </>
  );
}
