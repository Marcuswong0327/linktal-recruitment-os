'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import {
  getGetConsultantsQueryKey,
  updateConsultant as updateConsultantRequest,
  useGetConsultants,
  useUpdateConsultant,
} from '@/lib/api/generated/consultants/consultants';
import type { UpdateConsultantDto } from '@/lib/api/generated/types';
import { getConsultantColumns } from './columns';
import { type Consultant, type ConsultantRole, consultantRoleLabels, consultantRoles } from './schema';

const PAGE_SIZE = 20;

// Badge variants for the filter dropdown pills — a close approximation of
// the select trigger palette in columns.tsx (Badge has a fixed variant set,
// so "accent" for researcher maps to the closest neutral, "outline").
const roleFilterVariant: Record<ConsultantRole, 'default' | 'info' | 'warning' | 'secondary' | 'outline' | 'muted'> = {
  admin: 'default',
  manager: 'info',
  finance: 'warning',
  consultant: 'secondary',
  researcher: 'outline',
  viewer: 'muted',
};

const userFilters: DataGridFilter[] = [
  {
    columnId: 'roleName',
    title: 'Role',
    single: true,
    options: consultantRoles.map((value) => ({
      value,
      label: consultantRoleLabels[value],
      variant: roleFilterVariant[value],
    })),
  },
  {
    columnId: 'isActive',
    title: 'Status',
    single: true,
    options: [
      { value: 'true', label: 'Active', variant: 'success' },
      { value: 'false', label: 'Inactive', variant: 'destructive' },
    ],
  },
];

export function ConsultantsTable() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [role, setRole] = React.useState<string | undefined>();
  const [isActive, setIsActive] = React.useState<boolean | undefined>();
  const [selectedUsers, setSelectedUsers] = React.useState<Consultant[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);

  const currentConsultantId = session?.user?.consultantId;

  const { data, isLoading, isError, error } = useGetConsultants(
    { page, pageSize: PAGE_SIZE, q: search, roleName: role, isActive },
    { query: { placeholderData: keepPreviousData } },
  );

  const updateUser = useUpdateConsultant({
    mutation: {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetConsultantsQueryKey() });
        const label = variables.data.roleName !== undefined ? 'role' : 'status';
        toast.success(`Updated ${label}`);
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to update user');
      },
    },
  });

  const result = data?.status === 200 ? data.data : undefined;
  const users = result?.data ?? [];
  const pendingId = updateUser.isPending ? (updateUser.variables?.id ?? null) : null;

  function handleQueryChange({ search, columnFilters }: DataGridQuery) {
    const roleFilter = columnFilters.find((f) => f.id === 'roleName')?.value as string[] | undefined;
    const statusFilter = columnFilters.find((f) => f.id === 'isActive')?.value as string[] | undefined;
    setSearch(search.trim() || undefined);
    setRole(roleFilter?.[0]);
    setIsActive(statusFilter?.[0] === undefined ? undefined : statusFilter[0] === 'true');
    setPage(1);
  }

  // Bypasses the useUpdateUser hook (which only tracks one in-flight call at
  // a time) — bulk fires several concurrent requests, and we want a single
  // summary toast, not one per row.
  async function handleBulkUpdate(data: UpdateConsultantDto, actionLabel: string) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(
      selectedUsers.map((u) => updateConsultantRequest(u.id, data)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: getGetConsultantsQueryKey() });
    if (succeeded > 0) toast.success(`${actionLabel} for ${succeeded} user${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed for ${failed} user${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelectedUsers([]);
  }

  const columns = React.useMemo(
    () =>
      getConsultantColumns({
        pendingId,
        isSelf: (user: Consultant) => user.id === currentConsultantId,
        onRoleChange: (user, newRole: ConsultantRole) => updateUser.mutate({ id: user.id, data: { roleName: newRole } }),
        onStatusChange: (user, newIsActive) => updateUser.mutate({ id: user.id, data: { isActive: newIsActive } }),
      }),
    [pendingId, currentConsultantId, updateUser],
  );

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load consultants: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <DataGrid
      columns={columns}
      data={users}
      isLoading={isLoading}
      searchPlaceholder="Search consultants…"
      filters={userFilters}
      emptyState="No consultants yet."
      getRowId={(user) => user.id}
      canSelectRow={(user) => user.id !== currentConsultantId}
      onSelectionChange={setSelectedUsers}
      toolbar={
        selectedUsers.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="lg" disabled={isBulkUpdating}>
                  {isBulkUpdating ? 'Updating…' : `Bulk actions (${selectedUsers.length})`}
                  <ChevronDown />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Set role</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {consultantRoles.map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => handleBulkUpdate({ roleName: r }, `Role set to ${consultantRoleLabels[r]}`)}
                    >
                      {consultantRoleLabels[r]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Set status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleBulkUpdate({ isActive: true }, 'Activated')}>
                    Active
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => handleBulkUpdate({ isActive: false }, 'Deactivated')}
                  >
                    Inactive
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
      server={{
        total: result?.total ?? 0,
        page,
        pageSize: PAGE_SIZE,
        pageCount: result?.pageCount ?? 1,
        onPageChange: setPage,
        onQueryChange: handleQueryChange,
      }}
    />
  );
}
