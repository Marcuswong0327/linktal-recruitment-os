'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { CheckCheck, ChevronDown, Download, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ClientCombobox } from '@/components/ClientCombobox';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LogContactSheet, type LogContactValues } from '@/components/LogContactSheet';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useCreateStakeholderRoleType } from '@/lib/api/generated/stakeholder-role-types/stakeholder-role-types';
import type { ClientEntity } from '@/lib/api/generated/types';
import {
  createJobTitle,
  deleteStakeholder,
  STAKEHOLDERS_QUERY_KEY,
  updateStakeholder,
  useAddStakeholderContactHistory,
  useCreateStakeholder,
  useGetJobTitles,
  useGetStakeholderRoleTypesFull,
  useGetStakeholders,
  useUpdateStakeholder,
} from './api';
import { getStakeholderColumns } from './columns';
import { exportStakeholdersToExcel } from './exportToExcel';
import {
  stakeholderFullName,
  StakeholderSortField,
  type SortOrder,
  type Stakeholder,
} from './schema';

const PAGE_SIZE = 20;

// Shared palette for Role type coloring — the filter dropdown (Badge
// `variant`) and the Role type cell/form pickers (raw `triggerClassName`,
// since CreatableCombobox isn't on the Badge variant system) draw from the
// same ordered list, so a given role type gets the same color in both
// places. Role types are a user-grown catalog (CreatableCombobox), not a
// fixed enum, so there's no per-value semantic color to assign — cycle by
// position instead, same reasoning as Consultants' roleFilterVariant.
const ROLE_TYPE_PALETTE: {
  variant: NonNullable<React.ComponentProps<typeof Badge>['variant']>;
  triggerClassName: string;
}[] = [
  { variant: 'default', triggerClassName: 'border-primary/30 bg-primary/10 text-primary' },
  { variant: 'info', triggerClassName: 'border-info/30 bg-info/10 text-info' },
  { variant: 'warning', triggerClassName: 'border-warning/30 bg-warning/10 text-warning' },
  { variant: 'secondary', triggerClassName: 'border-transparent bg-secondary text-secondary-foreground' },
  { variant: 'outline', triggerClassName: 'border-border text-foreground' },
  { variant: 'muted', triggerClassName: 'border-transparent bg-muted text-muted-foreground' },
];
function roleTypeStyle(index: number) {
  return ROLE_TYPE_PALETTE[index % ROLE_TYPE_PALETTE.length];
}

/** Editable fields shared by the create and edit forms. */
interface StakeholderFormValues {
  clientId: string;
  firstName: string;
  lastName: string;
  jobTitleId: string;
  roleTypeId: string;
  linkedinUrl: string;
  email: string;
  mobile: string;
  isAccurate: boolean | null;
  inaccurateReason: string;
}

function buildStakeholderPayload(values: StakeholderFormValues) {
  return {
    clientId: values.clientId,
    firstName: values.firstName || null,
    lastName: values.lastName || null,
    jobTitleId: values.jobTitleId || null,
    roleTypeId: values.roleTypeId || null,
    linkedinUrl: values.linkedinUrl || null,
    email: values.email || null,
    mobile: values.mobile || null,
    isAccurate: values.isAccurate,
    inaccurateReason: values.inaccurateReason || null,
  };
}

export function StakeholdersTable({
  canCreate = true,
  canUpdate = true,
  canDelete = true,
}: {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [roleTypeIds, setRoleTypeIds] = React.useState<string[] | undefined>();
  const [sortBy, setSortBy] = React.useState<StakeholderSortField | undefined>();
  const [sortOrder, setSortOrder] = React.useState<SortOrder>('desc');
  const [selected, setSelected] = React.useState<Stakeholder[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [loggingContactFor, setLoggingContactFor] = React.useState<Stakeholder | null>(null);

  // Opened via the global command palette's "Add a Stakeholder" action
  // (`/stakeholders?new=1`) — strip the param immediately so refresh/back
  // doesn't reopen the sheet.
  React.useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true);
      router.replace('/stakeholders');
    }
  }, [searchParams, router]);

  const { data, isLoading, isFetching, isError, error } = useGetStakeholders({
    page,
    pageSize: PAGE_SIZE,
    q: search,
    roleTypeIds,
    sortBy,
    sortOrder,
  });
  const result = data?.status === 200 ? data.data : undefined;
  const stakeholders = result?.data ?? [];

  // Full roster for the Company picker — pageSize is capped at 100
  // server-side (query-clients.dto.ts), same known limitation as the
  // consultant lookup this pattern is borrowed from.
  const { data: clientsData } = useGetClients({ pageSize: 100 });
  const clients: ClientEntity[] = clientsData?.status === 200 ? clientsData.data.data : [];

  const { data: roleTypeData } = useGetStakeholderRoleTypesFull();
  const roleTypeRows = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const roleTypeOptions = React.useMemo(
    () =>
      roleTypeRows.map((r, i) => ({
        id: r.id,
        name: r.name,
        triggerClassName: roleTypeStyle(i).triggerClassName,
      })),
    [roleTypeRows],
  );

  const { data: jobTitleData } = useGetJobTitles();
  const jobTitleRows = jobTitleData?.status === 200 ? jobTitleData.data : [];
  const jobTitleOptions = React.useMemo(
    () => jobTitleRows.map((j) => ({ id: j.id, name: j.name })),
    [jobTitleRows],
  );

  const stakeholderFilters: DataGridFilter[] = React.useMemo(
    () => [
      {
        columnId: 'roleType',
        title: 'Role type',
        // Same treatment as Consultants' Role/Status filters: single-select
        // with a colored badge per option. Role types are a user-grown
        // catalog rather than a fixed enum, so there's no fixed semantic
        // color per value — cycle the palette by position instead.
        single: true,
        options: roleTypeRows.map((r, i) => ({
          value: r.id,
          label: r.name,
          variant: roleTypeStyle(i).variant,
        })),
      },
    ],
    [roleTypeRows],
  );

  const createRoleType = useCreateStakeholderRoleType({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ['/stakeholder-role-types'] }),
      onError: (err) => toast.error(err.message || 'Failed to add role type'),
    },
  });
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    return res.data;
  }

  async function handleCreateJobTitle(name: string) {
    const res = await createJobTitle(name);
    if (res.status !== 201) throw new Error('Failed to add job title');
    queryClient.invalidateQueries({ queryKey: ['/job-titles'] });
    return res.data;
  }

  const createStakeholderMutation = useCreateStakeholder({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAKEHOLDERS_QUERY_KEY });
      toast.success('Stakeholder added');
      setCreating(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to add stakeholder'),
  });

  const updateStakeholderMutation = useUpdateStakeholder({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAKEHOLDERS_QUERY_KEY });
    },
    onError: (err) => toast.error(err.message || 'Failed to update stakeholder'),
  });
  const pendingRowId = updateStakeholderMutation.isPending
    ? (updateStakeholderMutation.variables?.id ?? null)
    : null;

  const addContactHistory = useAddStakeholderContactHistory({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAKEHOLDERS_QUERY_KEY });
      toast.success('Contact logged');
      setLoggingContactFor(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to log contact'),
  });

  function handleQueryChange({ search, sorting, columnFilters }: DataGridQuery) {
    const roleTypeFilter = columnFilters.find((f) => f.id === 'roleType')?.value as
      string[] | undefined;
    const sort = sorting[0];
    const sortField =
      sort && sort.id in StakeholderSortField ? (sort.id as StakeholderSortField) : undefined;
    setSearch(search.trim() || undefined);
    setRoleTypeIds(roleTypeFilter);
    setSortBy(sortField);
    setSortOrder(sort?.desc ? 'desc' : 'asc');
    setPage(1);
  }

  function handleCreate(values: StakeholderFormValues) {
    createStakeholderMutation.mutate(buildStakeholderPayload(values));
  }

  const handleRoleTypeChange = React.useCallback(
    (stakeholder: Stakeholder, roleTypeId: string) => {
      updateStakeholderMutation.mutate(
        { id: stakeholder.id, data: { roleTypeId: roleTypeId || null } },
        { onSuccess: () => toast.success('Role type updated') },
      );
    },
    [updateStakeholderMutation],
  );

  const handleAccuracyChange = React.useCallback(
    (stakeholder: Stakeholder, isAccurate: boolean | null) => {
      updateStakeholderMutation.mutate(
        { id: stakeholder.id, data: { isAccurate } },
        { onSuccess: () => toast.success('Details accuracy updated') },
      );
    },
    [updateStakeholderMutation],
  );

  function handleLogContact(values: LogContactValues) {
    if (!loggingContactFor) return;
    addContactHistory.mutate({
      id: loggingContactFor.id,
      data: {
        contactType: values.contactType,
        contactedAt: values.contactedAt,
        ...(values.notes ? { notes: values.notes } : {}),
      },
    });
  }

  // Fires several concurrent requests directly (not via a mutation hook,
  // which only tracks one in-flight call at a time) so bulk gets a single
  // summary toast instead of one per row.
  async function handleBulkSetAccuracy(isAccurate: boolean | null) {
    setIsBulkUpdating(true);
    const results = await Promise.allSettled(
      selected.map((s) => updateStakeholder(s.id, { isAccurate })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    queryClient.invalidateQueries({ queryKey: STAKEHOLDERS_QUERY_KEY });
    const label = isAccurate === null ? 'Unchecked' : isAccurate ? 'Accurate' : 'Inaccurate';
    if (succeeded > 0)
      toast.success(`Marked ${succeeded} stakeholder${succeeded === 1 ? '' : 's'} as ${label}`);
    if (failed > 0) toast.error(`Failed for ${failed} stakeholder${failed === 1 ? '' : 's'}`);
    setIsBulkUpdating(false);
    setSelected([]);
  }

  function handleBulkDelete() {
    setDeleteConfirmOpen(false);
    const toDelete = selected;
    const label = `${toDelete.length} stakeholder${toDelete.length === 1 ? '' : 's'}`;
    // No restore endpoint for Stakeholder — delayed mode: nothing is sent to
    // the server until the undo window elapses, so Undo is exact rather than
    // cosmetic (see @/lib/delete-with-undo).
    deleteWithUndo({
      label,
      deleteFn: async () => {
        const results = await Promise.allSettled(toDelete.map((s) => deleteStakeholder(s.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`Failed to delete ${failed} of ${toDelete.length} stakeholders`);
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: STAKEHOLDERS_QUERY_KEY }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: STAKEHOLDERS_QUERY_KEY }),
    });
    setSelected([]);
  }

  function handleExport() {
    exportStakeholdersToExcel(selected.length > 0 ? selected : stakeholders);
  }

  const columns = React.useMemo(
    () =>
      getStakeholderColumns({
        roleTypes: roleTypeOptions,
        onRoleTypeChange: handleRoleTypeChange,
        onCreateRoleType: handleCreateRoleType,
        onAccuracyChange: handleAccuracyChange,
        onLogContact: setLoggingContactFor,
        pendingRowId,
        canUpdate,
      }),
    [roleTypeOptions, handleRoleTypeChange, handleAccuracyChange, pendingRowId, canUpdate],
  );

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load stakeholders: {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={stakeholders}
        isLoading={isLoading}
        isFetching={isFetching}
        searchPlaceholder="Search stakeholders…"
        filters={stakeholderFilters}
        emptyState="No stakeholders yet. Add your first contact to get started."
        getRowId={(s) => s.id}
        onRowClick={(s) => router.push(`/stakeholders/${s.id}`)}
        onSelectionChange={setSelected}
        enableRowRangeSelect
        hideSelectColumn
        footerActions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              Add Stakeholder
            </Button>
          ) : undefined
        }
        toolbar={
          selected.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="lg" disabled={isBulkUpdating}>
                    {isBulkUpdating ? 'Updating…' : `Bulk actions (${selected.length})`}
                    <ChevronDown />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport}>
                  <Download />
                  Export to Excel
                </DropdownMenuItem>
                {canUpdate ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <CheckCheck />
                      Mark details
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-48">
                      <DropdownMenuItem onClick={() => handleBulkSetAccuracy(true)}>
                        <Badge variant="success" className="rounded-md">
                          Accurate
                        </Badge>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkSetAccuracy(false)}>
                        <Badge variant="destructive" className="rounded-md">
                          Inaccurate
                        </Badge>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
        selectionContextMenu={
          <>
            <ContextMenuItem onClick={handleExport}>
              <Download />
              Export to Excel
            </ContextMenuItem>
            {canUpdate ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <CheckCheck />
                  Mark details
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-48">
                  <ContextMenuItem onClick={() => handleBulkSetAccuracy(true)}>
                    <Badge variant="success" className="rounded-md">
                      Accurate
                    </Badge>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleBulkSetAccuracy(false)}>
                    <Badge variant="destructive" className="rounded-md">
                      Inaccurate
                    </Badge>
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : null}
            {canDelete ? (
              <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 />
                Delete
              </ContextMenuItem>
            ) : null}
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

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${selected.length} stakeholder${selected.length === 1 ? '' : 's'}?`}
        description="You can undo this from the toast right after, or it's gone for good."
        onConfirm={handleBulkDelete}
      />

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full sm:max-w-md">
          {creating ? (
            <StakeholderForm
              title="Add stakeholder"
              description="Add a new contact for a client company."
              clients={clients}
              roleTypes={roleTypeOptions}
              onCreateRoleType={handleCreateRoleType}
              jobTitles={jobTitleOptions}
              onCreateJobTitle={handleCreateJobTitle}
              isSaving={createStakeholderMutation.isPending}
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <LogContactSheet
        open={loggingContactFor !== null}
        onOpenChange={(open) => !open && setLoggingContactFor(null)}
        subjectLabel={loggingContactFor ? stakeholderFullName(loggingContactFor) || 'this contact' : ''}
        isSaving={addContactHistory.isPending}
        onSave={handleLogContact}
      />
    </>
  );
}

/** "Add stakeholder" drawer form — only the company is required, everything else is optional (mirrors CreateStakeholderDto). Editing an existing stakeholder happens on its detail page (/stakeholders/[id]), not here. */
function StakeholderForm({
  title,
  description,
  clients,
  roleTypes,
  onCreateRoleType,
  jobTitles,
  onCreateJobTitle,
  isSaving,
  onSave,
  onCancel,
}: {
  title: string;
  description: string;
  clients: ClientEntity[];
  roleTypes: CreatableComboboxOption[];
  onCreateRoleType: (name: string) => Promise<CreatableComboboxOption>;
  jobTitles: CreatableComboboxOption[];
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  isSaving: boolean;
  onSave: (values: StakeholderFormValues) => void;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [jobTitleId, setJobTitleId] = React.useState('');
  const [roleTypeId, setRoleTypeId] = React.useState('');
  const [linkedinUrl, setLinkedinUrl] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [isAccurate, setIsAccurate] = React.useState<boolean | null>(null);
  const [inaccurateReason, setInaccurateReason] = React.useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      clientId,
      firstName,
      lastName,
      jobTitleId,
      roleTypeId,
      linkedinUrl,
      email,
      mobile,
      isAccurate,
      inaccurateReason,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company" htmlFor="stakeholder-company" required>
          <ClientCombobox id="stakeholder-company" value={clientId} onValueChange={setClientId} clients={clients} />
        </FormField>
        <FormField label="First name" htmlFor="stakeholder-first-name">
          <Input id="stakeholder-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </FormField>
        <FormField label="Last name" htmlFor="stakeholder-last-name">
          <Input id="stakeholder-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </FormField>
        <FormField label="Job title" htmlFor="stakeholder-job-title">
          <CreatableCombobox
            id="stakeholder-job-title"
            value={jobTitleId}
            onValueChange={setJobTitleId}
            options={jobTitles}
            onCreate={onCreateJobTitle}
          />
        </FormField>
        <FormField label="Role type" htmlFor="stakeholder-role-type">
          <CreatableCombobox
            id="stakeholder-role-type"
            value={roleTypeId}
            onValueChange={setRoleTypeId}
            options={roleTypes}
            onCreate={onCreateRoleType}
          />
        </FormField>
        <FormField label="LinkedIn URL" htmlFor="stakeholder-linkedin">
          <Input id="stakeholder-linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
        </FormField>
        <FormField label="Email" htmlFor="stakeholder-email">
          <Input id="stakeholder-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Mobile" htmlFor="stakeholder-mobile">
          <Input id="stakeholder-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </FormField>
        <FormField
          label="Details accurate"
          htmlFor="stakeholder-accurate"
          description="Whether these contact details have been verified."
        >
          <EnumSelect
            id="stakeholder-accurate"
            value={isAccurate === null ? 'unchecked' : String(isAccurate)}
            onValueChange={(v) => setIsAccurate(v === 'unchecked' ? null : v === 'true')}
            options={[
              { value: 'unchecked', label: 'Unchecked' },
              { value: 'true', label: 'Accurate' },
              { value: 'false', label: 'Inaccurate' },
            ]}
          />
        </FormField>
        {isAccurate === false ? (
          <FormField label="What's wrong" htmlFor="stakeholder-inaccurate-reason">
            <textarea
              id="stakeholder-inaccurate-reason"
              value={inaccurateReason}
              onChange={(e) => setInaccurateReason(e.target.value)}
              className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
            />
          </FormField>
        ) : null}
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving || !clientId}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </SheetFooter>
    </form>
  );
}
