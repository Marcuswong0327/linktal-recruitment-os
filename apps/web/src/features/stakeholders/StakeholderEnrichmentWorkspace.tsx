'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { DataGrid } from '@/components/DataGrid';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { downloadFile } from '@/lib/api/fetcher';
import {
  getExportStakeholdersByIdsUrl,
  getGetStakeholdersQueryKey,
  useGetStakeholdersForEnrichment,
  useUpdateStakeholder,
} from '@/lib/api/generated/stakeholders/stakeholders';
import { useCreateStakeholderRoleType, useGetStakeholderRoleTypes } from '@/lib/api/generated/stakeholder-role-types/stakeholder-role-types';
import type { StakeholderEntity, UpdateStakeholderDto } from '@/lib/api/generated/types';
import { getStakeholderColumns, roleTypeStyle, type StakeholderStatus } from './columns';

/**
 * The cross-company enrichment workspace: every stakeholder across a
 * hand-picked, ordered set of companies (`clientIds`, already deduped and in
 * the order the companies were selected — see CompaniesTable/JobResearchTable's
 * selection-order tracking). One request via GET /stakeholders/enrichment
 * (unbounded, no pagination — see stakeholders.service.ts's
 * `findForEnrichment`), then a client-side groupBy(clientId) pass that
 * flattens the result back out in `clientIds` order, so the grid shows every
 * stakeholder under company A, then company C, then company B — whatever
 * order they were selected in, independent of the grid's own current sort.
 */
export function StakeholderEnrichmentWorkspace({
  clientIds,
  canUpdate,
}: {
  clientIds: string[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<StakeholderEntity[]>([]);
  const [isExporting, setIsExporting] = React.useState(false);

  const { data, isLoading, isError, error } = useGetStakeholdersForEnrichment({ clientIds, sortBy: 'firstName', sortOrder: 'asc' });
  const flat = data?.status === 200 ? data.data : [];

  // Group by company, then flatten back out in selection order — the whole
  // point of this workspace. A single pass: bucket every row by its
  // clientId, then walk `clientIds` (already deduped/ordered by the caller)
  // and concatenate each bucket in turn.
  const stakeholders = React.useMemo(() => {
    const byClient = new Map<string, StakeholderEntity[]>();
    for (const s of flat) {
      const bucket = byClient.get(s.clientId);
      if (bucket) bucket.push(s);
      else byClient.set(s.clientId, [s]);
    }
    return clientIds.flatMap((id) => byClient.get(id) ?? []);
  }, [flat, clientIds]);

  const { data: roleTypeData } = useGetStakeholderRoleTypes({ take: 200 });
  const roleTypeRows = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const roleTypeOptions = React.useMemo(
    () => roleTypeRows.map((r, i) => ({ id: r.id, name: r.name, triggerClassName: roleTypeStyle(i).triggerClassName })),
    [roleTypeRows],
  );

  const createRoleType = useCreateStakeholderRoleType({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/stakeholder-role-types'] }),
      onError: (err) => toast.error(err.message || 'Failed to add role type'),
    },
  });
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    return res.data;
  }

  const updateStakeholderMutation = useUpdateStakeholder({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to update stakeholder'),
    },
  });
  const pendingRowId = updateStakeholderMutation.isPending ? (updateStakeholderMutation.variables?.id ?? null) : null;

  const handleRoleTypeChange = React.useCallback(
    (stakeholder: StakeholderEntity, roleTypeId: string) => {
      updateStakeholderMutation.mutate(
        { id: stakeholder.id, data: { roleTypeId: roleTypeId || null } as UpdateStakeholderDto },
        { onSuccess: () => toast.success('Role type updated') },
      );
    },
    [updateStakeholderMutation],
  );

  const handleStatusChange = React.useCallback(
    (stakeholder: StakeholderEntity, status: StakeholderStatus) => {
      updateStakeholderMutation.mutate(
        { id: stakeholder.id, data: { status } },
        { onSuccess: () => toast.success('Status updated') },
      );
    },
    [updateStakeholderMutation],
  );

  const columns = React.useMemo(
    () =>
      getStakeholderColumns({
        roleTypes: roleTypeOptions,
        onRoleTypeChange: handleRoleTypeChange,
        onCreateRoleType: handleCreateRoleType,
        onStatusChange: handleStatusChange,
        pendingRowId,
        canUpdate,
      }),
    [roleTypeOptions, handleRoleTypeChange, handleStatusChange, pendingRowId, canUpdate],
  );

  async function handleExport() {
    setIsExporting(true);
    // Same loading-toast pattern as every table's export — see
    // StakeholdersTable's own note.
    toast.loading('Exporting…', { id: 'export-enrichment' });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const ids = selected.length > 0 ? selected.map((s) => s.id) : stakeholders.map((s) => s.id);
      await downloadFile(getExportStakeholdersByIdsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, timezone }),
      });
      toast.success('Export ready', { id: 'export-enrichment' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: 'export-enrichment' });
    } finally {
      setIsExporting(false);
    }
  }

  if (isError) {
    return (
      <PageLayout>
        <p className="text-sm text-destructive">
          Failed to load stakeholders: {error?.message ?? 'Unknown error'}
        </p>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/companies" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back
        </Button>
        <PageHeader
          title="Stakeholder Enrichment Workspace"
          description={`Every contact across ${clientIds.length} selected compan${clientIds.length === 1 ? 'y' : 'ies'}, grouped in the order you selected them — filter, edit, and export before reaching out.`}
        />
      </div>

      <DataGrid
        columns={columns}
        data={stakeholders}
        isLoading={isLoading}
        searchPlaceholder="Search stakeholders…"
        emptyState="No stakeholders found for the selected companies."
        getRowId={(s) => s.id}
        // Logging a contact now lives on the stakeholder's own detail page
        // (LogContactRow, an inline row in that page's own contact-history
        // table) — there's no more standalone modal to trigger from a flat
        // list, so a row click routes there instead, same as StakeholdersTable.
        onRowClick={(s) => router.push(`/stakeholders/${s.id}`)}
        onSelectionChange={setSelected}
        enableRowRangeSelect
        toolbar={
          <Button size="lg" variant="outline" disabled={isExporting || stakeholders.length === 0} onClick={handleExport}>
            <Download />
            {isExporting ? 'Exporting…' : `Export to Excel${selected.length > 0 ? ` (${selected.length})` : ''}`}
          </Button>
        }
      />
    </PageLayout>
  );
}
