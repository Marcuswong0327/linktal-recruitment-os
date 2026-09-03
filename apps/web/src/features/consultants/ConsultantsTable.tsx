'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { ChevronDown, MapPin, Orbit, Shield } from 'lucide-react';
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
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { LEVEL_LABEL, LocationFilterButton } from '@/components/LocationMultiSelect';
import { RenameDialog } from '@/components/RenameDialog';
import { deleteWithUndo, undoLabel } from '@/lib/delete-with-undo';
import {
  SpecializationFilterButton,
  type SpecializationOption,
} from '@/components/SpecializationPicker';
import { TagFilterButton, type TagOption } from '@/components/TagMultiSelect';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import {
  getGetConsultantsQueryKey,
  updateConsultant as updateConsultantRequest,
  useGetConsultants,
  useSetConsultantIndustries,
  useSetConsultantLocations,
  useSetConsultantSpecializations,
  useUpdateConsultant,
} from '@/lib/api/generated/consultants/consultants';
import { GetConsultantsSortBy } from '@/lib/api/generated/types/getConsultantsSortBy';
import type { GetConsultantsSortOrder } from '@/lib/api/generated/types/getConsultantsSortOrder';
import {
  getGetIndustriesQueryKey,
  useCreateIndustry,
  useDeleteIndustry,
  useGetIndustries,
  useUpdateIndustry,
} from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
  useDeleteSpecialization,
  useUpdateSpecialization,
} from '@/lib/api/generated/specializations/specializations';
import type { LocationEntity, UpdateConsultantDto } from '@/lib/api/generated/types';
import { hasPermission } from '@/lib/auth/permissions';
import { getConsultantColumns } from './columns';
import { CreateSpecializationDialog } from './CreateSpecializationDialog';
import {
  type Consultant,
  type ConsultantRole,
  consultantRoleLabels,
  consultantRoles,
} from './schema';

type CatalogKind = 'industry' | 'specialization';
interface CatalogTagTarget {
  kind: CatalogKind;
  value: string;
  label: string;
  /** Only meaningful for specializations — needed to re-create the row on Undo (see `handleConfirmDelete`). */
  industryId?: string;
}

const PAGE_SIZE = 50;

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

const roleStatusFilters: DataGridFilter[] = [
  {
    columnId: 'roleName',
    title: 'Role',
    single: true,
    options: consultantRoles.map((value) => ({
      value,
      label: consultantRoleLabels[value],
      variant: roleFilterVariant[value],
    })),
    inHeader: true,
  },
  {
    columnId: 'isActive',
    title: 'Status',
    single: true,
    options: [
      { value: 'true', label: 'Active', variant: 'success' },
      { value: 'false', label: 'Inactive', variant: 'destructive' },
    ],
    inHeader: true,
  },
];

export function ConsultantsTable() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  // Server-side sort — infinite scroll only ever has one page's worth of
  // rows loaded at a time, so sorting has to happen on the server; a local
  // resort of just the loaded subset would silently go stale (and get
  // clobbered) the moment the next page arrives. See DataGrid's manualSorting.
  const [sortBy, setSortBy] = React.useState<GetConsultantsSortBy | undefined>();
  const [sortOrder, setSortOrder] = React.useState<GetConsultantsSortOrder>('desc');
  const [role, setRole] = React.useState<string | undefined>();
  const [isActive, setIsActive] = React.useState<boolean | undefined>();
  const [industryFilterIds, setIndustryFilterIds] = React.useState<string[] | undefined>();
  const [specializationFilterIds, setSpecializationFilterIds] = React.useState<
    string[] | undefined
  >();
  const [locationFilterIds, setLocationFilterIds] = React.useState<string[] | undefined>();
  // Name for the Specializations filter's currently selected ids — same
  // reasoning and pattern as locationInfoById below (the search-driven
  // SpecializationFilterButton only resolves names for whatever it's
  // actually fetched, not the full catalog).
  const [specializationInfoById, setSpecializationInfoById] = React.useState<Map<string, string>>(
    new Map(),
  );
  const resolveSpecializationInfo = React.useCallback((id: string, name: string) => {
    setSpecializationInfoById((prev) => (prev.get(id) === name ? prev : new Map(prev).set(id, name)));
  }, []);
  // Name/level for the Locations filter's currently selected ids — the API
  // only returns these alongside a live search result, not by id, so this is
  // seeded as the user searches (see LocationFilterButton's onResolve) and
  // only needs to cover whatever's selected in this session. Same pattern as
  // Companies' marketInfoById.
  const [locationInfoById, setLocationInfoById] = React.useState<
    Map<string, { name: string; level: LocationEntity['level'] }>
  >(new Map());
  const resolveLocationInfo = React.useCallback(
    (id: string, name: string, level: LocationEntity['level']) => {
      setLocationInfoById((prev) =>
        prev.get(id)?.name === name ? prev : new Map(prev).set(id, { name, level }),
      );
    },
    [],
  );
  const [selectedUsers, setSelectedUsers] = React.useState<Consultant[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);

  const currentConsultantId = session?.user?.consultantId;
  // Admins are exempt from the self-lockout on Role/Status (see
  // getConsultantColumns' `isAdmin` doc comment) — the API still blocks the
  // actually-unsafe self-edits (deactivating/de-admin-ing yourself, or
  // demoting the last active admin).
  const isAdmin = session?.user?.roleName === 'admin';
  // Column is present at all only when the caller can see assigned
  // industries; editable within that only when they can also change them —
  // matches the API omitting `industries`/`industryIds` entirely (not just
  // returning them empty) without `consultant_industry:read`.
  const canReadIndustries = hasPermission(session, 'consultant_industry', 'read');
  const canEditIndustries = hasPermission(session, 'consultant_industry', 'update');
  const canReadSpecializations = hasPermission(session, 'consultant_specialization', 'read');
  const canEditSpecializations = hasPermission(session, 'consultant_specialization', 'update');
  const canReadLocations = hasPermission(session, 'consultant_location', 'read');
  const canEditLocations = hasPermission(session, 'consultant_location', 'update');
  // Separate from the two above: these gate managing the Industry/
  // Specialization *catalog* itself (rename, deactivate, grow it inline via
  // "+ Create") from the same columns' tag pickers — admin + manager only,
  // per the RBAC matrix (docs/rbac-roles.md §"industry"/"specialization").
  const canCreateIndustries = hasPermission(session, 'industry', 'create');
  const canUpdateIndustries = hasPermission(session, 'industry', 'update');
  const canDeleteIndustries = hasPermission(session, 'industry', 'delete');
  const canCreateSpecializations = hasPermission(session, 'specialization', 'create');
  const canUpdateSpecializations = hasPermission(session, 'specialization', 'update');
  const canDeleteSpecializations = hasPermission(session, 'specialization', 'delete');

  const { data, isLoading, isFetching, isError, error } = useGetConsultants(
    {
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortOrder,
      q: search,
      roleName: role,
      isActive,
      industryIds: industryFilterIds,
      specializationIds: specializationFilterIds,
      locationIds: locationFilterIds,
    },
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

  // Specialization (775+ rows) is deliberately NOT fetched eagerly here —
  // every consumer (the inline column editor, its header filter, and
  // CreateSpecializationDialog's parent-category picker) is now a
  // SpecializationPicker component that searches `GET /specializations`
  // server-side instead. See specializationInfoById below for the small
  // per-id name cache that replaces what the old full-catalog fetch used to
  // resolve for free.

  const userFilters: DataGridFilter[] = React.useMemo(
    () => [
      ...roleStatusFilters,
      ...(canReadIndustries
        ? [
            {
              columnId: 'industries',
              title: 'Industries',
              options: industryOptions,
              inHeader: true,
              // Searchable Combobox, not the plain checkbox list — the
              // Industry catalog is short-ish but this keeps it consistent
              // with Specializations below, which genuinely needs it.
              render: ({
                selected,
                onChange,
              }: {
                selected: string[];
                onChange: (values: string[]) => void;
              }) => (
                <TagFilterButton
                  selected={selected}
                  onChange={onChange}
                  options={industryOptions}
                  title="Industries"
                />
              ),
            },
          ]
        : []),
      ...(canReadSpecializations
        ? [
            {
              columnId: 'specializations',
              title: 'Specializations',
              inHeader: true,
              // Specialization is a ~774-row catalog — scanning an unfiltered
              // checkbox list doesn't scale, so this is server-searched
              // (GET /specializations?q=&take=), same as the inline picker.
              render: ({
                selected,
                onChange,
              }: {
                selected: string[];
                onChange: (values: string[]) => void;
              }) => (
                <SpecializationFilterButton
                  selected={selected}
                  onChange={onChange}
                  onResolve={resolveSpecializationInfo}
                  title="Specializations"
                />
              ),
              labelFor: (id: string) => specializationInfoById.get(id) ?? id,
            },
          ]
        : []),
      ...(canReadLocations
        ? [
            {
              columnId: 'locations',
              title: 'City Coverage',
              inHeader: true,
              render: ({
                selected,
                onChange,
              }: {
                selected: string[];
                onChange: (values: string[]) => void;
              }) => (
                <LocationFilterButton
                  selected={selected}
                  onChange={onChange}
                  onResolve={resolveLocationInfo}
                  title="Locations"
                />
              ),
              labelFor: (id: string) => locationInfoById.get(id)?.name ?? id,
              chipContent: (id: string) => {
                const info = locationInfoById.get(id);
                return (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {info?.name ?? id}
                    {info ? (
                      <span className="text-[10px] tracking-wide opacity-70 uppercase">
                        {LEVEL_LABEL[info.level]}
                      </span>
                    ) : null}
                  </span>
                );
              },
            },
          ]
        : []),
    ],
    [
      canReadIndustries,
      industryOptions,
      canReadSpecializations,
      specializationInfoById,
      resolveSpecializationInfo,
      canReadLocations,
      locationInfoById,
      resolveLocationInfo,
    ],
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

  const setLocations = useSetConsultantLocations({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetConsultantsQueryKey() });
        toast.success('City Coverage updated');
      },
      onError: (err) => toast.error(err.message || 'Failed to update locations'),
    },
  });

  // --- Industry/Specialization catalog management, surfaced inline from the
  // tag pickers above (the "+ Create" row and each tag's "…" menu) rather
  // than a separate admin page, since neither catalog has one. Admin/manager
  // only, per canCreate/canUpdate/canDelete above. ---

  const createIndustryMutation = useCreateIndustry({
    mutation: { onError: (err) => toast.error(err.message || 'Failed to add industry') },
  });
  async function handleCreateIndustry(name: string): Promise<TagOption> {
    const res = await createIndustryMutation.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add industry');
    queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() });
    return { value: res.data.id, label: res.data.name };
  }

  const createSpecializationMutation = useCreateSpecialization({
    mutation: { onError: (err) => toast.error(err.message || 'Failed to add specialization') },
  });
  // Unlike Industry, a Specialization needs an industryId it can't infer from
  // just the typed name (see schema.prisma) — the multi-select's "+ Create"
  // opens CreateSpecializationDialog to collect it, and this promise is what
  // that dialog eventually resolves or rejects (Cancel/close = reject).
  const pendingCreateSpecialization = React.useRef<{
    resolve: (option: SpecializationOption) => void;
    reject: (err: unknown) => void;
  } | null>(null);
  const [createSpecializationDraft, setCreateSpecializationDraft] = React.useState<string | null>(
    null,
  );
  function handleCreateSpecialization(name: string): Promise<SpecializationOption> {
    return new Promise((resolve, reject) => {
      pendingCreateSpecialization.current = { resolve, reject };
      setCreateSpecializationDraft(name);
    });
  }
  function handleCreateSpecializationDialogChange(open: boolean) {
    if (!open) {
      // A no-op once the dialog's own submit handler already resolved and
      // cleared the ref — this only fires the reject path for an actual
      // Cancel/Esc/backdrop close.
      pendingCreateSpecialization.current?.reject(new Error('Cancelled'));
      pendingCreateSpecialization.current = null;
      setCreateSpecializationDraft(null);
    }
  }
  async function handleSubmitCreateSpecialization(data: {
    name: string;
    industryId: string;
    parentId?: string;
  }) {
    const res = await createSpecializationMutation.mutateAsync({ data });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() });
    pendingCreateSpecialization.current?.resolve({
      id: res.data.id,
      name: res.data.name,
      industryId: res.data.industryId,
    });
    pendingCreateSpecialization.current = null;
    setCreateSpecializationDraft(null);
  }

  const updateIndustryMutation = useUpdateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to rename industry'),
    },
  });
  const updateSpecializationMutation = useUpdateSpecialization({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to rename specialization'),
    },
  });
  const [renameTarget, setRenameTarget] = React.useState<CatalogTagTarget | null>(null);
  function renameCatalogEntry(kind: CatalogKind, id: string, name: string) {
    return kind === 'industry'
      ? updateIndustryMutation.mutateAsync({ id, data: { name } })
      : updateSpecializationMutation.mutateAsync({ id, data: { name } });
  }
  async function handleRenameSubmit(value: string) {
    if (!renameTarget) return;
    const { kind, value: id, label: previousName } = renameTarget;
    await renameCatalogEntry(kind, id, value);
    // The success toast lives here (not in the mutations' onSuccess above) so
    // it can offer Undo — renaming back to `previousName`, which this same
    // helper reuses. A second click just renames again, so there's no risk
    // of an inconsistent state even if Undo is clicked after further edits.
    toast.success(`Renamed to "${value}"`, {
      action: {
        label: undoLabel,
        onClick: () => {
          renameCatalogEntry(kind, id, previousName)
            .then(() => toast.success(`Reverted to "${previousName}"`))
            .catch((err) =>
              toast.error(err instanceof Error ? err.message : 'Failed to undo rename'),
            );
        },
      },
    });
  }

  const deleteIndustryMutation = useDeleteIndustry();
  const deleteSpecializationMutation = useDeleteSpecialization();
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogTagTarget | null>(null);
  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const queryKey =
      target.kind === 'industry' ? getGetIndustriesQueryKey() : getGetSpecializationsQueryKey();
    // Specialization's industryId is only known when SpecializationMultiSelect
    // happened to have resolved it (a search result or a fresh create) — see
    // SpecializationOption's own doc comment. Recreating a deleted row needs
    // it, so a delete without it falls back to deleteWithUndo's "delayed"
    // mode (no restoreFn — the delete itself waits out the grace window
    // instead of committing immediately), which needs no industryId to undo.
    const canRestore = target.kind === 'industry' || target.industryId != null;
    deleteWithUndo({
      label: `${target.kind} "${target.label}"`,
      deleteFn: () =>
        target.kind === 'industry'
          ? deleteIndustryMutation.mutateAsync({ id: target.value })
          : deleteSpecializationMutation.mutateAsync({ id: target.value }),
      // Neither catalog has a dedicated restore endpoint — re-adding the same
      // name reactivates the deactivated row instead (see
      // IndustriesService.create / SpecializationsService.create), so that
      // doubles as Undo here.
      restoreFn: canRestore
        ? () =>
            target.kind === 'industry'
              ? createIndustryMutation.mutateAsync({ data: { name: target.label } })
              : createSpecializationMutation.mutateAsync({
                  data: { name: target.label, industryId: target.industryId! },
                })
        : undefined,
      onCommitted: () => queryClient.invalidateQueries({ queryKey }),
      onUndo: () => queryClient.invalidateQueries({ queryKey }),
    });
  }

  const result = data?.status === 200 ? data.data : undefined;
  const users = useInfinitePages(result?.data, page, isFetching);
  const pendingId = updateUser.isPending
    ? (updateUser.variables?.id ?? null)
    : setIndustries.isPending
      ? (setIndustries.variables?.id ?? null)
      : setSpecializations.isPending
        ? (setSpecializations.variables?.id ?? null)
        : setLocations.isPending
          ? (setLocations.variables?.id ?? null)
          : null;

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const valueOf = (columnId: string) =>
      columnFilters.find((f) => f.id === columnId)?.value as string[] | undefined;
    const roleFilter = valueOf('roleName');
    const statusFilter = valueOf('isActive');
    const industryFilter = valueOf('industries');
    const specializationFilter = valueOf('specializations');
    const locationFilter = valueOf('locations');
    const sort = sorting[0];
    const sortField = sort && sort.id in GetConsultantsSortBy ? (sort.id as GetConsultantsSortBy) : undefined;
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setSearch(search.trim() || undefined);
    setRole(roleFilter?.[0]);
    setIsActive(statusFilter?.[0] === undefined ? undefined : statusFilter[0] === 'true');
    setIndustryFilterIds(industryFilter?.length ? industryFilter : undefined);
    setSpecializationFilterIds(specializationFilter?.length ? specializationFilter : undefined);
    setLocationFilterIds(locationFilter?.length ? locationFilter : undefined);
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
        isAdmin,
        onRoleChange: (user, newRole: ConsultantRole) =>
          updateUser.mutate({ id: user.id, data: { roleName: newRole } }),
        onStatusChange: (user, newIsActive) =>
          updateUser.mutate({ id: user.id, data: { isActive: newIsActive } }),
        industries: canReadIndustries
          ? {
              options: industryOptions,
              onIndustriesChange: canEditIndustries
                ? (user, industryIds) =>
                    setIndustries.mutate({ id: user.id, data: { industryIds } })
                : undefined,
              onCreateIndustry: canCreateIndustries ? handleCreateIndustry : undefined,
              onEditIndustry: canUpdateIndustries
                ? (option) => setRenameTarget({ kind: 'industry', ...option })
                : undefined,
              onDeleteIndustry: canDeleteIndustries
                ? (option) => setDeleteTarget({ kind: 'industry', ...option })
                : undefined,
            }
          : undefined,
        specializations: canReadSpecializations
          ? {
              onSpecializationsChange: canEditSpecializations
                ? (user, specializationIds) =>
                    setSpecializations.mutate({ id: user.id, data: { specializationIds } })
                : undefined,
              onCreateSpecialization: canCreateSpecializations
                ? handleCreateSpecialization
                : undefined,
              onEditSpecialization: canUpdateSpecializations
                ? (option) =>
                    setRenameTarget({
                      kind: 'specialization',
                      value: option.id,
                      label: option.name,
                      industryId: option.industryId,
                    })
                : undefined,
              onDeleteSpecialization: canDeleteSpecializations
                ? (option) =>
                    setDeleteTarget({
                      kind: 'specialization',
                      value: option.id,
                      label: option.name,
                      industryId: option.industryId,
                    })
                : undefined,
            }
          : undefined,
        locations: canReadLocations
          ? {
              onLocationsChange: canEditLocations
                ? (user, locationIds) => setLocations.mutate({ id: user.id, data: { locationIds } })
                : undefined,
            }
          : undefined,
      }),
    [
      pendingId,
      currentConsultantId,
      isAdmin,
      updateUser,
      canReadIndustries,
      canEditIndustries,
      canCreateIndustries,
      canUpdateIndustries,
      canDeleteIndustries,
      industryOptions,
      setIndustries,
      handleCreateIndustry,
      canReadSpecializations,
      canEditSpecializations,
      canCreateSpecializations,
      canUpdateSpecializations,
      canDeleteSpecializations,
      setSpecializations,
      handleCreateSpecialization,
      canReadLocations,
      canEditLocations,
      setLocations,
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
    <>
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
                          handleBulkUpdate(
                            { roleName: r },
                            `Role set to ${consultantRoleLabels[r]}`,
                          )
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
                <ContextMenuItem
                  onClick={() => handleBulkUpdate({ isActive: false }, 'Deactivated')}
                >
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
          infiniteScroll: true,
          isFetchingNextPage: isFetching && page > 1,
        }}
      />

      <RenameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        title={`Rename ${renameTarget?.kind ?? ''}`}
        initialValue={renameTarget?.label ?? ''}
        onSubmit={handleRenameSubmit}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.label}"?`}
        description="Consultants who already have it keep it. You can undo this from the toast right after."
        onConfirm={handleConfirmDelete}
      />

      <CreateSpecializationDialog
        open={createSpecializationDraft !== null}
        onOpenChange={handleCreateSpecializationDialogChange}
        initialName={createSpecializationDraft ?? ''}
        industries={industryOptions}
        onSubmit={handleSubmitCreateSpecialization}
      />
    </>
  );
}
