'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  useSetConsultantIndustries,
  useUpdateConsultant,
} from '@/lib/api/generated/consultants/consultants';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import type { UpdateConsultantDto } from '@/lib/api/generated/types';
import { hasPermission } from '@/lib/auth/permissions';
import { getConsultantColumns } from './columns';
import {
  type Consultant,
  type ConsultantRole,
  consultantRoleLabels,
  consultantRoles,
} from './schema';

const PAGE_SIZE = 20;

// Badge variants for the filter dropdown pills — a close approximation of
// the select trigger palette in columns.tsx (Badge has a fixed variant set,
// so "accent" for researcher maps to the closest neutral, "outline").
const roleFilterVariant: Record<
  ConsultantRole,
  'default' | 'info' | 'warning' | 'secondary' | 'outline' | 'muted'
> = {
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
  // Column is present at all only when the caller can see assigned
  // industries; editable within that only when they can also change them —
  // matches the API omitting `industries`/`industryIds` entirely (not just
  // returning them empty) without `consultant_industry:read`.
  const canReadIndustries = hasPermission(session, 'consultant_industry', 'read');
  const canEditIndustries = hasPermission(session, 'consultant_industry', 'update');

  const { data, isLoading, isFetching, isError, error } = useGetConsultants(
    { page, pageSize: PAGE_SIZE, q: search, roleName: role, isActive },
    { query: { placeholderData: keepPreviousData } },
  );

  const { data: industriesData } = useGetIndustries({
    query: { enabled: canReadIndustries },
  });
  const industryOptions = React.useMemo(
    () =>
      industriesData?.status === 200
        ? industriesData.data.map((i) => ({ value: i.id, label: i.name }))
        : [],
    [industriesData],
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

  const setIndustries = useSetConsultantIndustries({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetConsultantsQueryKey() });
        toast.success('Industries updated');
      },
      onError: (err) => toast.error(err.message || 'Failed to update industries'),
    },
  });

  const result = data?.status === 200 ? data.data : undefined;
  const users = result?.data ?? [];
  const pendingId = updateUser.isPending
    ? (updateUser.variables?.id ?? null)
    : setIndustries.isPending
      ? (setIndustries.variables?.id ?? null)
      : null;

  function handleQueryChange({ search, columnFilters }: DataGridQuery) {
    const roleFilter = columnFilters.find((f) => f.id === 'roleName')?.value as
      string[] | undefined;
    const statusFilter = columnFilters.find((f) => f.id === 'isActive')?.value as
      string[] | undefined;
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
    if (succeeded > 0)
      toast.success(`${actionLabel} for ${succeeded} user${succeeded === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`Failed for ${failed} user${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelectedUsers([]);
  }

  const columns = React.useMemo(
    () =>
      getConsultantColumns({
        pendingId,
        isSelf: (user: Consultant) => user.id === currentConsultantId,
        onRoleChange: (user, newRole: ConsultantRole) =>
          updateUser.mutate({ id: user.id, data: { roleName: newRole } }),
        onStatusChange: (user, newIsActive) =>
          updateUser.mutate({ id: user.id, data: { isActive: newIsActive } }),
        industries: canReadIndustries
          ? {
              options: industryOptions,
              onIndustriesChange: canEditIndustries
                ? (user, industryIds) => setIndustries.mutate({ id: user.id, data: { industryIds } })
                : undefined,
            }
          : undefined,
      }),
    [pendingId, currentConsultantId, updateUser, canReadIndustries, canEditIndustries, industryOptions, setIndustries],
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
      isFetching={isFetching}
      searchPlaceholder="Search consultants…"
      filters={userFilters}
      emptyState="No consultants yet."
      getRowId={(user) => user.id}
      canSelectRow={(user) => user.id !== currentConsultantId}
      onSelectionChange={setSelectedUsers}
      enableRowRangeSelect
      hideSelectColumn
      toolbar={
        selectedUsers.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="lg" disabled={isBulkUpdating}>
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
                      onClick={() =>
                        handleBulkUpdate({ roleName: r }, `Role set to ${consultantRoleLabels[r]}`)
                      }
                    >
                      <Badge variant={roleFilterVariant[r]}>{consultantRoleLabels[r]}</Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Set status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => handleBulkUpdate({ isActive: true }, 'Activated')}
                  >
                    <Badge variant="success">Active</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleBulkUpdate({ isActive: false }, 'Deactivated')}
                  >
                    <Badge variant="destructive">Inactive</Badge>
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
