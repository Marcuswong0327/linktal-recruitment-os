'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataGrid } from '@/components/DataGrid';
import { useGetRoles } from '@/lib/api/generated/roles/roles';
import { RoleForm } from './RoleForm';
import { DeleteRoleSheet } from './DeleteRoleSheet';
import { type Role, isBuiltin, isDeletable } from './schema';

export function RolesTable() {
  // Roles are few — fetch one page and let the grid filter/paginate client-side.
  const { data, isLoading, isError, error } = useGetRoles({ page: 1, pageSize: 100 });
  const result = data?.status === 200 ? data.data : undefined;
  const roles = result?.data ?? [];

  const [editing, setEditing] = React.useState<Role | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<Role | null>(null);

  const columns = React.useMemo<ColumnDef<Role>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Role',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium capitalize text-foreground">{row.original.name}</span>
            {isBuiltin(row.original.name) && (
              <Badge variant="outline" className="text-[10px]">
                built-in
              </Badge>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        // Absorbs leftover width on a wide screen — see DataGridColumnMeta.grow.
        meta: { grow: true },
        cell: ({ row }) => (
          <span className="block truncate text-muted-foreground">
            {row.original.description || '—'}
          </span>
        ),
      },
      {
        id: 'permissions',
        header: 'Permissions',
        size: 120,
        meta: { align: 'center' },
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.permissions.length}</span>,
      },
      {
        accessorKey: 'consultantCount',
        header: 'Consultants',
        size: 120,
        meta: { align: 'center' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.consultantCount}</span>,
      },
      {
        id: 'actions',
        header: '',
        size: 56,
        enableSorting: false,
        meta: { align: 'center' },
        cell: ({ row }) =>
          isDeletable(row.original.name) ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.original.name}`}
              title="Delete role"
              onClick={(e) => {
                e.stopPropagation();
                setDeleting(row.original);
              }}
            >
              <Trash2 className="text-muted-foreground" />
            </Button>
          ) : null,
      },
    ],
    [],
  );

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load roles: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={roles}
        isLoading={isLoading}
        searchPlaceholder="Search roles…"
        columnSizingKey="roles"
        onRowClick={setEditing}
        emptyState="No roles yet."
        toolbar={
          <Button size="lg" onClick={() => setEditing('new')}>
            <Plus />
            Add role
          </Button>
        }
      />

      <RoleForm
        role={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
      <DeleteRoleSheet
        role={deleting}
        allRoles={roles}
        open={deleting !== null}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
