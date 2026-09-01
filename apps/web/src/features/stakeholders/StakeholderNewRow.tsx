'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { GridCellEnumCombobox } from '@/components/GridCellEnumCombobox';
import { GridCellClientCombobox } from '@/components/GridCellClientCombobox';
import { GridCellCombobox } from '@/components/GridCellCombobox';
import { useJobTitleOptions } from '@/hooks/use-catalog-options';
import { GridCellInput } from '@/components/GridCellInput';
import {
  GridCellContactInput,
  emptyContact,
  type ContactValues,
} from '@/components/GridCellContactInput';
import {
  GridCellLocationMultiSelect,
  type LocationChoice,
} from '@/components/GridCellLocationCombobox';
import { splitFullName } from '@/lib/split-full-name';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import type { CreatableComboboxOption } from '@/components/CreatableCombobox';
import type {
  CreateStakeholderDto,
  StakeholderEntityStatus,
} from '@/lib/api/generated/types';
import { stakeholderStatusOptions } from './columns';

interface StakeholderDraft {
  clientId: string;
  /** One typed box; split into firstName/lastName on save — see `splitFullName`. */
  fullName: string;
  jobTitleId: string;
  roleTypeId: string;
  /** Email / phone / LinkedIn, filed by shape from one box — see GridCellContactInput. */
  contact: ContactValues;
  coverage: LocationChoice[];
  status: string;
}

const emptyDraft: StakeholderDraft = {
  clientId: '',
  fullName: '',
  jobTitleId: '',
  roleTypeId: '',
  contact: emptyContact,
  coverage: [],
  status: '',
};

interface UseStakeholderNewRowOptions {
  roleTypes: CreatableComboboxOption[];
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  onCreateRoleType: (name: string) => Promise<CreatableComboboxOption>;
  /** Persists the record. Resolve to commit and clear the row; reject to keep what was typed. */
  onCreate: (dto: CreateStakeholderDto) => Promise<void>;
  disabled?: boolean;
}

/**
 * The always-present "type a new stakeholder here" row for the Stakeholders
 * table — see `DataGridProps.newRow`.
 *
 * `CreateStakeholderDto` requires only Company and First name; everything
 * else here is offered but omitted when untouched, so the server's defaults
 * stand rather than this row restating them. Contact detail beyond an email,
 * and the accuracy flags, are left to the detail drawer — they don't have
 * columns in this table to sit under.
 */
export function useStakeholderNewRow({
  roleTypes,
  onCreateJobTitle,
  onCreateRoleType,
  onCreate,
  disabled = false,
}: UseStakeholderNewRowOptions): DataGridNewRow {
  // Server-searched — the Job Titles catalog is far larger than one page.
  const jobTitleSearch = useJobTitleOptions();
  const [draft, setDraft] = React.useState(emptyDraft);
  const [isSaving, setIsSaving] = React.useState(false);

  function set<K extends keyof StakeholderDraft>(key: K, value: StakeholderDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const canCommit = draft.clientId !== '' && draft.fullName.trim() !== '' && !disabled;

  async function handleCommit() {
    if (!canCommit || isSaving) return;
    setIsSaving(true);
    try {
      const { firstName, lastName } = splitFullName(draft.fullName);
      await onCreate({
        clientId: draft.clientId,
        firstName,
        ...(lastName ? { lastName } : {}),
        ...(draft.jobTitleId ? { jobTitleId: draft.jobTitleId } : {}),
        ...(draft.roleTypeId ? { roleTypeId: draft.roleTypeId } : {}),
        ...(draft.contact.email ? { email: draft.contact.email } : {}),
        ...(draft.contact.mobile ? { mobile: draft.contact.mobile } : {}),
        ...(draft.contact.linkedinUrl ? { linkedinUrl: draft.contact.linkedinUrl } : {}),
        ...(draft.coverage.length
          ? { coverageLocationIds: draft.coverage.map((l) => l.id) }
          : {}),
        ...(draft.status ? { status: draft.status as StakeholderEntityStatus } : {}),
      });
      setDraft(emptyDraft);
      requestAnimationFrame(() => focusNewRowStart());
    } catch {
      // Toasted by the caller; the draft survives so a failed save doesn't
      // discard what was typed.
    } finally {
      setIsSaving(false);
    }
  }

  const editors: Record<string, React.ReactNode> = {
    // One box, not a first/last pair: the column is a single "Name" and
    // people type a name in one go. The last word becomes the surname (see
    // `splitFullName`) — the detail page is where the two halves are edited
    // apart if the split guessed wrong.
    fullName: (
      <GridCellInput
        value={draft.fullName}
        onChange={(e) => set('fullName', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Name"
      />
    ),
    companyName: (
      <GridCellClientCombobox
        value={draft.clientId}
        onValueChange={(id) => set('clientId', id)}
        disabled={disabled || isSaving}
      />
    ),
    coverage: (
      <GridCellLocationMultiSelect
        selected={draft.coverage}
        onChange={(next) => set('coverage', next)}
        disabled={disabled || isSaving}
      />
    ),
    roleType: (
      <GridCellCombobox
        value={draft.roleTypeId}
        onValueChange={(id) => set('roleTypeId', id)}
        options={roleTypes}
        onCreate={onCreateRoleType}
        disabled={disabled || isSaving}
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
      />
    ),
    contact: (
      <GridCellContactInput
        value={draft.contact}
        onChange={(next) => set('contact', next)}
        disabled={disabled || isSaving}
      />
    ),
    status: (
      <GridCellEnumCombobox
        value={draft.status}
        onValueChange={(v) => set('status', v)}
        options={stakeholderStatusOptions}
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
        draft.clientId ? null : 'Company',
        draft.fullName.trim() ? null : 'Name',
      ].filter(Boolean);
      toast.error(`${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    },
  };
}
