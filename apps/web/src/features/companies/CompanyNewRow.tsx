'use client';

import * as React from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { GridCellEnumCombobox } from '@/components/GridCellEnumCombobox';
import { GridCellInput } from '@/components/GridCellInput';
import { GridCellSpecializationCombobox } from '@/components/GridCellSpecializationCombobox';
import {
  GridCellLocationMultiSelect,
  type LocationChoice,
} from '@/components/GridCellLocationCombobox';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import { useCreateSpecialization } from '@/lib/api/generated/specializations/specializations';
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
  /** Industry catalog for the new row's own Industry cell — 4 rows. */
  industries: { value: string; label: string }[];
  /** `specialization:create` — without it the Specialization cell is pick-only. */
  canCreateSpecialization?: boolean;
}

/**
 * The always-present "type a new company here" row for the Companies table —
 * see `DataGridProps.newRow`.
 *
 * `CreateClientDto` requires `companyName`, `industryId` and at least one
 * location. Industry now has its own cell (the column was restored alongside
 * the editable Specialization cell), and it opens **pre-filled with the
 * user's own industry** when they hold exactly one grant — the overwhelmingly
 * common case, and the row they'd have picked by hand. Holding several, it
 * starts blank rather than guessing: `industryId` feeds the scope resolver's
 * industry arm, so a silently wrong default would hide the new company from
 * the colleagues who should see it.
 *
 * Picking a specialization still back-fills industry when the cell hasn't been
 * touched, so the old "specialization carries its parent" path keeps working.
 *
 * Neither Specialization nor Location is creatable here: there's no saved
 * company yet to hang the "which industry?" prompt off, and Location is
 * admin-only to grow.
 */
export function useCompanyNewRow({
  onCreate,
  disabled = false,
  industries,
  canCreateSpecialization = false,
}: UseCompanyNewRowOptions): DataGridNewRow {
  const { data: session } = useSession();
  // Exactly one grant is a default; several is a guess. Admins and managers
  // carry no grants at all, so they start blank too.
  const grantedIndustryIds = session?.user?.industryIds ?? [];
  const defaultIndustryId = grantedIndustryIds.length === 1 ? grantedIndustryIds[0] : '';

  const [draft, setDraft] = React.useState(emptyDraft);
  const [isSaving, setIsSaving] = React.useState(false);
  const createSpecialization = useCreateSpecialization();

  // The session arrives after first render, so seed the empty row once it
  // does — but never overwrite an industry the user has already chosen.
  React.useEffect(() => {
    if (!defaultIndustryId) return;
    setDraft((d) => (d.industryId === '' ? { ...d, industryId: defaultIndustryId } : d));
  }, [defaultIndustryId]);

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
      setDraft({ ...emptyDraft, industryId: defaultIndustryId });
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
    industry: (
      <GridCellEnumCombobox
        value={draft.industryId}
        onValueChange={(v) =>
          // Changing industry drops a specialization from the old one — the
          // same rule the saved rows follow.
          setDraft((d) =>
            v === d.industryId ? d : { ...d, industryId: v, specializationId: '' },
          )
        }
        options={industries}
        disabled={disabled || isSaving}
      />
    ),
    specialization: (
      <GridCellSpecializationCombobox
        value={draft.specializationId}
        industryId={draft.industryId || undefined}
        // Creatable straight from the cell: unlike a saved row, the parent
        // industry is already sitting beside it, so there's nothing to ask.
        // Withheld until an industry is chosen — POST /specializations
        // requires one, and guessing it is what the Industry cell exists to
        // avoid.
        onCreate={
          canCreateSpecialization && draft.industryId
            ? async (name) => {
                const industryIdForNew = draft.industryId;
                const res = await createSpecialization.mutateAsync({
                  data: { name, industryId: industryIdForNew },
                });
                if (res.status !== 201) throw new Error('Failed to add specialization');
                toast.success(`${res.data.name} added`);
                return { id: res.data.id, name: res.data.name, industryId: industryIdForNew };
              }
            : undefined
        }
        onValueChange={(picked) =>
          setDraft((d) => ({
            ...d,
            specializationId: picked?.id ?? '',
            // Only back-fill: an industry already chosen in its own cell wins.
            industryId: d.industryId || (picked?.industryId ?? ''),
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
    onReset: () => setDraft({ ...emptyDraft, industryId: defaultIndustryId }),
    canCommit,
    isSaving,
    onInvalidCommit: () => {
      if (disabled) return;
      const missing = [
        draft.companyName.trim() ? null : 'Company name',
        // Industry has its own cell now — naming Specialization here was
        // right only while industry was inferred from it.
        industryId ? null : 'Industry',
        draft.locations.length ? null : 'Market',
      ].filter(Boolean);
      toast.error(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    },
  };
}
