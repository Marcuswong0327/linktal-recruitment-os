'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { ConsultantMultiSelect } from '@/components/ConsultantCombobox';
import type { CreatableComboboxOption } from '@/components/CreatableCombobox';
import { GridCellClientCombobox } from '@/components/GridCellClientCombobox';
import { GridCellCombobox } from '@/components/GridCellCombobox';
import { useJobTitleOptions } from '@/hooks/use-catalog-options';
import { GridCellEnumCombobox } from '@/components/GridCellEnumCombobox';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import type {
  ConsultantEntity,
  CreateJobOrderDto,
  JobOrderEntityQuality,
  JobOrderEntityStatus,
} from '@/lib/api/generated/types';
import { priorityOptions, qualityOptions, statusOptions } from './schema';

interface JobOrderDraft {
  clientId: string;
  jobTitleId: string;
  status: string;
  quality: string;
  priorityLevel: string;
  consultantIds: string[];
}

const emptyDraft: JobOrderDraft = {
  clientId: '',
  jobTitleId: '',
  status: '',
  quality: '',
  priorityLevel: '',
  consultantIds: [],
};

interface UseJobOrderNewRowOptions {
  consultants: ConsultantEntity[];
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  /** Persists the record. Resolve to commit and clear the row; reject to keep what was typed. */
  onCreate: (dto: CreateJobOrderDto) => Promise<void>;
  disabled?: boolean;
}

/**
 * Builds the always-present "type a new job order here" row — the Job Orders
 * table's last row, parked on its bottom edge (see `DataGridProps.newRow`).
 *
 * Client and Role are the only fields `CreateJobOrderDto` requires; Status,
 * Quality, Priority and Consultant are all offered here too but left unsent
 * when untouched, so the server's own defaults (ACTIVE / MEDIUM / 2) still
 * apply rather than this row hardcoding a second copy of them. The remaining
 * columns are computed (submission counts, timestamps) and render blank.
 */
export function useJobOrderNewRow({
  consultants,
  onCreateJobTitle,
  onCreate,
  disabled = false,
}: UseJobOrderNewRowOptions): DataGridNewRow {
  // Server-searched — see useJobTitleOptions.
  const jobTitleSearch = useJobTitleOptions();
  const [draft, setDraft] = React.useState(emptyDraft);
  const [isSaving, setIsSaving] = React.useState(false);

  function set<K extends keyof JobOrderDraft>(key: K, value: JobOrderDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const canCommit = draft.clientId !== '' && draft.jobTitleId !== '' && !disabled;

  async function handleCommit() {
    if (!canCommit || isSaving) return;
    setIsSaving(true);
    try {
      await onCreate({
        clientId: draft.clientId,
        jobTitleId: draft.jobTitleId,
        ...(draft.status ? { status: draft.status as JobOrderEntityStatus } : {}),
        ...(draft.quality ? { quality: draft.quality as JobOrderEntityQuality } : {}),
        ...(draft.priorityLevel ? { priorityLevel: Number(draft.priorityLevel) } : {}),
        ...(draft.consultantIds.length ? { consultantIds: draft.consultantIds } : {}),
      });
      setDraft(emptyDraft);
      // Back to the first cell so the next one can be typed immediately —
      // after the state flush, or the row we're reaching for is the
      // pre-reset render.
      requestAnimationFrame(() => focusNewRowStart());
    } catch {
      // Toasted by the caller; the draft deliberately survives so a failed
      // save doesn't discard what was typed.
    } finally {
      setIsSaving(false);
    }
  }

  const editors: Record<string, React.ReactNode> = {
    status: (
      <GridCellEnumCombobox
        value={draft.status}
        onValueChange={(v) => set('status', v)}
        options={statusOptions}
        disabled={disabled || isSaving}
        placeholder="Status"
      />
    ),
    quality: (
      <GridCellEnumCombobox
        value={draft.quality}
        onValueChange={(v) => set('quality', v)}
        options={qualityOptions}
        disabled={disabled || isSaving}
        placeholder="Quality"
      />
    ),
    priorityLevel: (
      <GridCellEnumCombobox
        value={draft.priorityLevel}
        onValueChange={(v) => set('priorityLevel', v)}
        options={priorityOptions}
        disabled={disabled || isSaving}
        placeholder="Priority"
      />
    ),
    clientId: (
      <GridCellClientCombobox
        value={draft.clientId}
        onValueChange={(id) => set('clientId', id)}
        disabled={disabled || isSaving}
        placeholder="Client"
      />
    ),
    jobTitle: (
      <GridCellCombobox
        value={draft.jobTitleId}
        onValueChange={(id) => set('jobTitleId', id)}
        options={jobTitleSearch.options}
        serverSearched
        onQueryChange={jobTitleSearch.onQueryChange}
        onCreate={onCreateJobTitle}
        disabled={disabled || isSaving}
        placeholder="Role"
      />
    ),
    consultants: (
      <ConsultantMultiSelect
        selected={draft.consultantIds}
        onChange={(ids) => set('consultantIds', ids)}
        consultants={consultants}
        disabled={disabled || isSaving}
        placeholder="Consultants"
      />
    ),
  };

  return {
    editors,
    onCommit: handleCommit,
    onReset: () => setDraft(emptyDraft),
    canCommit,
    isSaving,
    // Enter on an incomplete row would otherwise do nothing at all, which
    // reads as a dead key rather than as "this isn't finished yet".
    onInvalidCommit: () => {
      if (disabled) return;
      const missing = [
        draft.clientId ? null : 'Client',
        draft.jobTitleId ? null : 'Role',
      ].filter(Boolean);
      toast.error(`${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    },
  };
}
