'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { GridCellEnumCombobox } from '@/components/GridCellEnumCombobox';
import { GridCellInput } from '@/components/GridCellInput';
import { GridCellSpecializationCombobox } from '@/components/GridCellSpecializationCombobox';
import {
  GridCellLocationMultiSelect,
  type LocationChoice,
} from '@/components/GridCellLocationCombobox';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import type {
  ClientEntityQuality,
  ClientEntityStatus,
  CreateClientDto,
} from '@/lib/api/generated/types';
import { qualityOptions, statusOptions } from './schema';

interface CompanyDraft {
  companyName: string;
  specializationId: string;
  /** Carried alongside the specialization — see the note on this hook. */
  industryId: string;
  locations: LocationChoice[];
  status: string;
  quality: string;
}

const emptyDraft: CompanyDraft = {
  companyName: '',
  specializationId: '',
  industryId: '',
  locations: [],
  status: '',
  quality: '',
};

interface UseCompanyNewRowOptions {
  /** Persists the record. Resolve to commit and clear the row; reject to keep what was typed. */
  onCreate: (dto: CreateClientDto) => Promise<void>;
  disabled?: boolean;
}

/**
 * The always-present "type a new company here" row for the Companies table —
 * see `DataGridProps.newRow`.
 *
 * `CreateClientDto` requires `companyName`, `industryId` and at least one
 * location. There is no Industry column in this table to hang an editor on,
 * so the **industry comes from the chosen specialization** — every
 * `Specialization` carries its parent `industryId` (Industry ▸ Specialization,
 * see CLAUDE.md), and clients are effectively all specialization-tagged
 * anyway. That keeps the required field satisfied without adding a column
 * to the grid purely for the sake of this row.
 *
 * Neither Specialization nor Location is creatable here: both are
 * scope-bearing catalogs whose creation is admin/manager-restricted, so an
 * "Add …" option would only produce a 403.
 */
export function useCompanyNewRow({
  onCreate,
  disabled = false,
}: UseCompanyNewRowOptions): DataGridNewRow {
  const [draft, setDraft] = React.useState(emptyDraft);
  const [isSaving, setIsSaving] = React.useState(false);

  function set<K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const industryId = draft.industryId || undefined;
  const canCommit =
    draft.companyName.trim() !== '' &&
    !!industryId &&
    draft.locations.length > 0 &&
    !disabled;

  async function handleCommit() {
    if (!canCommit || isSaving || !industryId) return;
    setIsSaving(true);
    try {
      await onCreate({
        companyName: draft.companyName.trim(),
        industryId,
        specializationId: draft.specializationId,
        locationIds: draft.locations.map((l) => l.id),
        ...(draft.status ? { status: draft.status as ClientEntityStatus } : {}),
        ...(draft.quality ? { quality: draft.quality as ClientEntityQuality } : {}),
      });
      setDraft(emptyDraft);
      requestAnimationFrame(() => focusNewRowStart());
    } catch {
      // Toasted by the caller; the draft survives a failed save.
    } finally {
      setIsSaving(false);
    }
  }

  const editors: Record<string, React.ReactNode> = {
    companyName: (
      <GridCellInput
        value={draft.companyName}
        onChange={(e) => set('companyName', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Company name"
      />
    ),
    specialization: (
      <GridCellSpecializationCombobox
        value={draft.specializationId}
        onValueChange={(picked) =>
          setDraft((d) => ({
            ...d,
            specializationId: picked?.id ?? '',
            industryId: picked?.industryId ?? '',
          }))
        }
        disabled={disabled || isSaving}
      />
    ),
    locations: (
      <GridCellLocationMultiSelect
        selected={draft.locations}
        onChange={(next) => set('locations', next)}
        disabled={disabled || isSaving}
      />
    ),
    status: (
      <GridCellEnumCombobox
        value={draft.status}
        onValueChange={(v) => set('status', v)}
        options={statusOptions}
        disabled={disabled || isSaving}
      />
    ),
    quality: (
      <GridCellEnumCombobox
        value={draft.quality}
        onValueChange={(v) => set('quality', v)}
        options={qualityOptions}
        disabled={disabled || isSaving}
      />
    ),
  };

  return {
    editors,
    onCommit: handleCommit,
    onReset: () => setDraft(emptyDraft),
    canCommit,
    isSaving,
    onInvalidCommit: () => {
      if (disabled) return;
      const missing = [
        draft.companyName.trim() ? null : 'Company name',
        industryId ? null : 'Specialization',
        draft.locations.length ? null : 'Market',
      ].filter(Boolean);
      toast.error(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    },
  };
}
