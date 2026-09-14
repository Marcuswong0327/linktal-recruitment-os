'use client';

import * as React from 'react';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { GridCellEnumCombobox } from '@/components/GridCellEnumCombobox';
import { GridCellCombobox } from '@/components/GridCellCombobox';
import { GridCellCompanyNameCombobox } from '@/components/GridCellCompanyNameCombobox';
import {
  GridCellLocationMultiSelect,
  type LocationChoice,
} from '@/components/GridCellLocationCombobox';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import { useRouter } from 'next/navigation';
import {
  getGetIndustriesQueryKey,
  useCreateIndustry,
} from '@/lib/api/generated/industries/industries';
import type {
  ClientEntityQuality,
  ClientEntityStatus,
  CreateClientDto,
} from '@/lib/api/generated/types';
import { qualityOptions, statusOptions } from './schema';

interface CompanyDraft {
  companyName: string;
  industryId: string;
  locations: LocationChoice[];
  status: string;
  quality: string;
}

const emptyDraft: CompanyDraft = {
  companyName: '',
  industryId: '',
  locations: [],
  status: '',
  quality: '',
};

interface UseCompanyNewRowOptions {
  /** Persists the record. Resolve to commit and clear the row; reject to keep what was typed. */
  onCreate: (dto: CreateClientDto) => Promise<void>;
  disabled?: boolean;
  /** Industry catalog for the new row's own Industry cell — small fixed set. */
  industries: { value: string; label: string }[];
  /** `industry:create` — without it the Industry cell is pick-only. */
  canCreateIndustry?: boolean;
}

/**
 * The always-present "type a new company here" row for the Companies table —
 * see `DataGridProps.newRow`.
 *
 * Industry is required on create (scope resolver), so the new-row Industry
 * cell stays editable. Specialization is edited only on the company detail
 * page — same as Candidates' grid (read-only chips in the list).
 */
export function useCompanyNewRow({
  onCreate,
  disabled = false,
  industries,
  canCreateIndustry = false,
}: UseCompanyNewRowOptions): DataGridNewRow {
  const router = useRouter();
  const { data: session } = useSession();
  const grantedIndustryIds = session?.user?.industryIds ?? [];
  const defaultIndustryId = grantedIndustryIds.length === 1 ? grantedIndustryIds[0] : '';

  const [draft, setDraft] = React.useState(emptyDraft);
  const [isSaving, setIsSaving] = React.useState(false);
  const queryClient = useQueryClient();
  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
    },
  });

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

  const industryOptions = React.useMemo(
    () => industries.map((i) => ({ id: i.value, name: i.label })),
    [industries],
  );

  const editors: Record<string, React.ReactNode> = {
    companyName: (
      <GridCellCompanyNameCombobox
        value={draft.companyName}
        onValueChange={(name) => set('companyName', name)}
        onSelectExisting={(match) => {
          toast.message(`Opening existing company "${match.name}"`);
          set('companyName', '');
          router.push(`/companies/${match.id}`);
        }}
        disabled={disabled || isSaving}
        placeholder="Company name"
      />
    ),
    industry: (
      <GridCellCombobox
        value={draft.industryId}
        onValueChange={(v) => set('industryId', v)}
        options={industryOptions}
        onCreate={
          canCreateIndustry
            ? async (name) => {
                const res = await createIndustry.mutateAsync({ data: { name } });
                if (res.status !== 201) throw new Error('Failed to add industry');
                toast.success(`${res.data.name} added`);
                return { id: res.data.id, name: res.data.name };
              }
            : undefined
        }
        disabled={disabled || isSaving}
        placeholder="Industry"
      />
    ),
    locations: (
      <GridCellLocationMultiSelect
        selected={draft.locations}
        onChange={(next) => set('locations', next)}
        disabled={disabled || isSaving}
        placeholder="City Coverage"
      />
    ),
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
        industryId ? null : 'Industry',
        draft.locations.length ? null : 'City Coverage',
      ].filter(Boolean);
      toast.error(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    },
  };
}
