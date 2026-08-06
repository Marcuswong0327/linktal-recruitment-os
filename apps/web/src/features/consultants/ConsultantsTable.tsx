'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { ChevronDown, Orbit, Shield } from 'lucide-react';
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
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import {
  getGetConsultantsQueryKey,
  updateConsultant as updateConsultantRequest,
  useGetConsultants,
  useSetConsultantIndustries,
  useSetConsultantSpecializations,
  useUpdateConsultant,
} from '@/lib/api/generated/consultants/consultants';
import { useGetIndustries } from '@/lib/api/generated/industries/industries';
import { useGetSpecializations } from '@/lib/api/generated/specializations/specializations';
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
  const canReadSpecializations = hasPermission(session, 'consultant_specialization', 'read');
  const canEditSpecializations = hasPermission(session, 'consultant_specialization', 'update');

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

  const { data: specializationsData } = useGetSpecializations(undefined, {
    query: { enabled: canReadSpecializations },
  });
  const specializationOptions = React.useMemo(
    () =>
      specializationsData?.status === 200
        ? specializationsData.data.map((s) => ({ value: s.id, label: s.name }))
        : [],
    [specializationsData],
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

  const setSpecializations = useSetConsultantSpecializations({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetConsultantsQueryKey() });
        toast.success('Specializations updated');
      },
      onError: (err) => toast.error(err.message || 'Failed to update specializations'),
    },
  });

  const result = data?.status === 200 ? data.data : undefined;
  const users = result?.data ?? [];
  const pendingId = updateUser.isPending
    ? (updateUser.variables?.id ?? null)
    : setIndustries.isPending
      ? (setIndustries.variables?.id ?? null)
      : setSpecializations.isPending
        ? (setSpecializations.variables?.id ?? null)
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
        specializations: canReadSpecializations
          ? {
              options: specializationOptions,
              onSpecializationsChange: canEditSpecializations
                ? (user, specializationIds) =>
                    setSpecializations.mutate({ id: user.id, data: { specializationIds } })
                : undefined,
            }
          : undefined,
      }),
    [
      pendingId,
      currentConsultantId,
      updateUser,
      canReadIndustries,
      canEditIndustries,
      industryOptions,
      setIndustries,
      canReadSpecializations,
      canEditSpecializations,
      specializationOptions,
      setSpecializations,
    ],
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
                <DropdownMenuSubTrigger>
                  <Shield />
                  Change role
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-48">
                  {consultantRoles.map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() =>
                        handleBulkUpdate({ roleName: r }, `Role set to ${consultantRoleLabels[r]}`)
                      }
                    >
                      <Badge variant={roleFilterVariant[r]} className="rounded-md">
                        {consultantRoleLabels[r]}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Orbit />
                  Update status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-48">
                  <DropdownMenuItem
                    onClick={() => handleBulkUpdate({ isActive: true }, 'Activated')}
                  >
                    <Badge variant="success" className="rounded-md">
                      Active
                    </Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleBulkUpdate({ isActive: false }, 'Deactivated')}
                  >
                    <Badge variant="destructive" className="rounded-md">
                      Inactive
                    </Badge>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
      // Unconditional, unlike the toolbar dropdown above — DataGrid only
      // mounts its right-click listener at all while this is non-null
      // (see OptionalContextMenu's `if (!content) return children`). Gating
      // it on selectedUsers.length here would mean the very first right-click
      // on an unselected row (which selects it and should open this same
      // menu) fires before the listener exists — selection would update a
      // few renders later, too late for that native contextmenu event.
      // Whether it's actually allowed to open is still correctly decided
      // inside DataGrid, from the row selection the same right-click just
      // produced.
      selectionContextMenu={
        <>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Shield />
              Change role
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-48">
              {consultantRoles.map((r) => (
                <ContextMenuItem
                  key={r}
                  onClick={() =>
                    handleBulkUpdate({ roleName: r }, `Role set to ${consultantRoleLabels[r]}`)
                  }
                >
                  <Badge variant={roleFilterVariant[r]} className="rounded-md">
                    {consultantRoleLabels[r]}
                  </Badge>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Orbit />
              Update status
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-48">
              <ContextMenuItem onClick={() => handleBulkUpdate({ isActive: true }, 'Activated')}>
                <Badge variant="success" className="rounded-md">
                      Active
                    </Badge>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleBulkUpdate({ isActive: false }, 'Deactivated')}>
                <Badge variant="destructive" className="rounded-md">
                      Inactive
                    </Badge>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </>
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
