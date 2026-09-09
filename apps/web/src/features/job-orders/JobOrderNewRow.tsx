'use client';

import * as React from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { ConsultantAvatar } from '@/components/ConsultantCombobox';
import type { CreatableComboboxOption } from '@/components/CreatableCombobox';
import { GridCellClientCombobox } from '@/components/GridCellClientCombobox';
import { GridCellEnumCombobox } from '@/components/GridCellEnumCombobox';
import { GridCellInput } from '@/components/GridCellInput';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import type {
  CreateJobOrderDto,
  JobOrderEntityQuality,
  JobOrderEntityStatus,
} from '@/lib/api/generated/types';
import { qualityOptions, statusOptions } from './schema';

interface JobOrderDraft {
  clientId: string;
  /** Free-text Role — resolved to a JobTitle id via upsert on commit. */
  roleText: string;
  status: string;
  quality: string;
}

const emptyDraft: JobOrderDraft = {
  clientId: '',
  roleText: '',
  status: '',
  quality: '',
};

interface UseJobOrderNewRowOptions {
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  /** Persists the record. Resolve to commit and clear the row; reject to keep what was typed. */
  onCreate: (dto: CreateJobOrderDto) => Promise<void>;
  disabled?: boolean;
}

/**
 * Builds the always-present "type a new job order here" row — the Job Orders
 * table's last row, parked on its bottom edge (see `DataGridProps.newRow`).
 *
 * Client and Role are the only fields `CreateJobOrderDto` requires; Status
 * and Quality are offered here but left unsent when untouched, so the
 * server's defaults (ACTIVE / MEDIUM) still apply. Role is plain free text
 * (no typeahead) — on commit the typed string is upserted into JobTitle and
 * the returned id is sent as `jobTitleId`. Consultant is fixed to the
 * signed-in user. The remaining columns are computed and render blank.
 */
export function useJobOrderNewRow({
  onCreateJobTitle,
  onCreate,
  disabled = false,
}: UseJobOrderNewRowOptions): DataGridNewRow {
  const { data: session } = useSession();
  const consultantId = session?.user?.consultantId;
  const consultantName = session?.user?.name ?? session?.user?.email ?? 'You';

  const [draft, setDraft] = React.useState(emptyDraft);
  const [isSaving, setIsSaving] = React.useState(false);

  function set<K extends keyof JobOrderDraft>(key: K, value: JobOrderDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const roleText = draft.roleText.trim();
  const canCommit = draft.clientId !== '' && roleText !== '' && !disabled;

  async function handleCommit() {
    if (!canCommit || isSaving) return;
    setIsSaving(true);
    try {
      // Upsert into the shared JobTitle catalog so CreateJobOrderDto still
      // receives a jobTitleId — no schema change, no suggestion UI while typing.
      const created = await onCreateJobTitle(roleText);
      await onCreate({
        clientId: draft.clientId,
        jobTitleId: created.id,
        ...(draft.status ? { status: draft.status as JobOrderEntityStatus } : {}),
        ...(draft.quality ? { quality: draft.quality as JobOrderEntityQuality } : {}),
        ...(consultantId ? { consultantIds: [consultantId] } : {}),
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
    clientId: (
      <GridCellClientCombobox
        value={draft.clientId}
        onValueChange={(id) => set('clientId', id)}
        disabled={disabled || isSaving}
        placeholder="Client"
      />
    ),
    jobTitle: (
      <GridCellInput
        value={draft.roleText}
        onChange={(e) => set('roleText', e.target.value)}
        disabled={disabled || isSaving}
        placeholder="Role"
      />
    ),
    consultants: consultantId ? (
      <div
        className="flex min-w-0 items-center gap-1.5 px-2"
        title={`${consultantName} — assigned automatically`}
      >
        <ConsultantAvatar consultantId={consultantId} name={consultantName} size={5} />
        <span className="truncate text-sm">{consultantName}</span>
      </div>
    ) : (
      <span className="px-2 text-sm text-muted-foreground">—</span>
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
        roleText ? null : 'Role',
      ].filter(Boolean);
      toast.error(`${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    },
  };
}
