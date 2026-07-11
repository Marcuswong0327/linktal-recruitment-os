'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DataGrid } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { userColumns } from './columns';
import { mockUsers } from './mock';
import {
  type User,
  userRoleLabels,
  userRoles,
  userStatusLabels,
  userStatuses,
} from './schema';

const roleOptions = userRoles.map((value) => ({
  value,
  label: userRoleLabels[value],
}));
const statusOptions = userStatuses.map((value) => ({
  value,
  label: userStatusLabels[value],
}));

export function UsersTable() {
  const [users, setUsers] = React.useState<User[]>(mockUsers);
  const [editing, setEditing] = React.useState<User | null>(null);

  function handleSave(updated: User) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setEditing(null);
    toast.success(`Saved changes to ${updated.name}`);
  }

  return (
    <>
      <DataGrid
        columns={userColumns}
        data={users}
        searchPlaceholder="Search users…"
        onRowClick={setEditing}
        emptyState="No users yet. Invite your team to get started."
        toolbar={
          <Button size="lg">
            <Plus />
            Add User
          </Button>
        }
      />

      {/* Edit drawer — edit a record in place instead of a full page. */}
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <SheetContent className="w-full sm:max-w-md">
          {editing ? (
            <EditUserForm
              key={editing.id}
              user={editing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function EditUserForm({
  user,
  onSave,
  onCancel,
}: {
  user: User;
  onSave: (user: User) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(user.name);
  const [email, setEmail] = React.useState(user.email);
  const [role, setRole] = React.useState<User['role']>(user.role);
  const [status, setStatus] = React.useState<User['status']>(user.status);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...user, name, email, role, status });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit user</SheetTitle>
        <SheetDescription>
          Update {user.name}’s details. Changes apply immediately.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Name" htmlFor="user-name">
          <Input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Email" htmlFor="user-email">
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Role" htmlFor="user-role">
          <EnumSelect
            id="user-role"
            value={role}
            onValueChange={(v) => setRole(v as User['role'])}
            options={roleOptions}
          />
        </FormField>
        <FormField label="Status" htmlFor="user-status">
          <EnumSelect
            id="user-status"
            value={status}
            onValueChange={(v) => setStatus(v as User['status'])}
            options={statusOptions}
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg">
          Save changes
        </Button>
      </SheetFooter>
    </form>
  );
}
