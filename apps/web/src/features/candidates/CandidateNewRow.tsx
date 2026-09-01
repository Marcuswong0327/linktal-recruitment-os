'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { GridCellCombobox } from '@/components/GridCellCombobox';
import { useJobRoleTypeOptions } from '@/hooks/use-catalog-options';
import { GridCellInput } from '@/components/GridCellInput';
import {
  GridCellContactInput,
  emptyContact,
  type ContactKind,
  type ContactValues,
} from '@/components/GridCellContactInput';
import { GridCellLocationCombobox } from '@/components/GridCellLocationCombobox';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import type { CreatableComboboxOption } from '@/components/CreatableCombobox';
import type { CreateCandidateDto, IndustryEntity } from '@/lib/api/generated/types';

interface CandidateDraft {
  firstName: string;
  lastName: string;
  contact: ContactValues;
  locationId: string;
  industryId: string;
  jobRoleTypeId: string;
  currentSalary: string;
  expectedSalary: string;
  /** Becomes a CandidateContactHistory row after the candidate saves — see `onCreate`. */
  notes: string;
}

// Candidates carry a Seek profile link as well as the common three — the
// Contact column already displays it (see ./columns).
const CANDIDATE_CONTACT_SLOTS: ContactKind[] = [
  'email',
  'mobile',
  'linkedinUrl',
  'seekTalentUrl',
];

const emptyDraft: CandidateDraft = {
  firstName: '',
  lastName: '',
  contact: emptyContact,
  locationId: '',
  industryId: '',
  jobRoleTypeId: '',
  currentSalary: '',
  expectedSalary: '',
  notes: '',
};

interface UseCandidateNewRowOptions {
  industries: IndustryEntity[];
  /**
   * The signed-in consultant's own industry grants (`SessionUserEntity.
   * industryIds`). The first is used as the row's default industry — a
   * recruiter sources into their own desk almost every time.
   */
  userIndustryIds: string[];
  onCreateJobRoleType: (name: string) => Promise<CreatableComboboxOption>;
  /**
   * Persists the record. Resolve to commit and clear the row; reject to keep
   * what was typed.
   *
   * `note` is passed separately because it isn't a candidate field at all: the
   * table's Notes column shows `lastContactNotes`, resolved live from the most
   * recent CandidateContactHistory row, so a note typed here has to become one
   * of those after the candidate itself exists.
   */
  onCreate: (dto: CreateCandidateDto, note?: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * The always-present "type a new candidate here" row for the Candidates
 * table — see `DataGridProps.newRow`.
 *
 * `CreateCandidateDto` requires `locationId` and `industryId`; the name is
 * optional server-side (historic fill rates are low), so this row doesn't
 * invent a stricter rule than the schema has.
 *
 * **Industry defaults to the signed-in consultant's own** rather than being
 * asked for every time — someone sourcing candidates is nearly always
 * sourcing into their own desk. It's still an editable picker, because a
 * consultant can hold several industry grants, and because admin/manager
 * hold none at all (unrestricted scope is zero grant rows, not a wildcard —
 * see CLAUDE.md), so for them there is nothing to default to and the picker
 * is the only way to set it.
 *
 * Industry is not creatable here: `industry:create` is admin/manager-only,
 * so an "Add …" option would only produce a 403.
 */
export function useCandidateNewRow({
  industries,
  userIndustryIds,
  onCreateJobRoleType,
  onCreate,
  disabled = false,
}: UseCandidateNewRowOptions): DataGridNewRow {
  // Server-searched — see useJobRoleTypeOptions.
  const roleTypeSearch = useJobRoleTypeOptions();
  const industryOptions = React.useMemo(
    () => industries.map((i) => ({ id: i.id, name: i.name })),
    [industries],
  );
  const defaultIndustryId = userIndustryIds[0] ?? '';

  const [draft, setDraft] = React.useState<CandidateDraft>({
    ...emptyDraft,
    industryId: defaultIndustryId,
  });
  const [isSaving, setIsSaving] = React.useState(false);

  // The session resolves after first paint, so the default usually isn't
  // known when the initial state is built. Only fills a still-empty cell —
  // never overwrites an industry the user has already chosen.
  React.useEffect(() => {
    if (!defaultIndustryId) return;
    setDraft((d) => (d.industryId ? d : { ...d, industryId: defaultIndustryId }));
  }, [defaultIndustryId]);

  function set<K extends keyof CandidateDraft>(key: K, value: CandidateDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const canCommit = draft.locationId !== '' && draft.industryId !== '' && !disabled;

  // Reset keeps the defaulted industry — it's the desk the user is working,
  // not something they re-pick per candidate.
  const freshDraft = () => ({ ...emptyDraft, industryId: defaultIndustryId });

  async function handleCommit() {
    if (!canCommit || isSaving) return;
    setIsSaving(true);
    try {
      await onCreate({
        locationId: draft.locationId,
        industryId: draft.industryId,
        ...(draft.firstName.trim() ? { firstName: draft.firstName.trim() } : {}),
        ...(draft.lastName.trim() ? { lastName: draft.lastName.trim() } : {}),
        ...(draft.contact.email ? { email: draft.contact.email } : {}),
        ...(draft.contact.mobile ? { mobile: draft.contact.mobile } : {}),
        ...(draft.contact.linkedinUrl ? { linkedinUrl: draft.contact.linkedinUrl } : {}),
        ...(draft.contact.seekTalentUrl ? { seekTalentUrl: draft.contact.seekTalentUrl } : {}),
        ...(draft.jobRoleTypeId ? { jobRoleTypeId: draft.jobRoleTypeId } : {}),
        // Salary fields are free text on purpose — the source data records
        // things like "35 per hour" (see CLAUDE.md).
        ...(draft.currentSalary.trim() ? { currentSalary: draft.currentSalary.trim() } : {}),
        ...(draft.expectedSalary.trim() ? { expectedSalary: draft.expectedSalary.trim() } : {}),
      }, draft.notes.trim() || undefined);
      setDraft(freshDraft());
      requestAnimationFrame(() => focusNewRowStart());
    } catch {
      // Toasted by the caller; the draft survives a failed save.
    } finally {
      setIsSaving(false);
    }
  }

  const editors: Record<string, React.ReactNode> = {
    jobRoleType: (
      <GridCellCombobox
        value={draft.jobRoleTypeId}
        onValueChange={(id) => set('jobRoleTypeId', id)}
        options={roleTypeSearch.options}
        serverSearched
        onQueryChange={roleTypeSearch.onQueryChange}
        onCreate={onCreateJobRoleType}
        disabled={disabled || isSaving}
      />
    ),
    // The Specialization column hosts Industry for this row: industry is what
    // the record actually requires, specialization tagging is optional and
    // belongs on the detail page (only a small share of candidates carry it).
    specialization: (
      <GridCellCombobox
        value={draft.industryId}
        onValueChange={(id) => set('industryId', id)}
        options={industryOptions}
        disabled={disabled || isSaving}
        placeholder="Industry"
      />
    ),
    suburbAndPostcode: (
      <GridCellLocationCombobox
        value={draft.locationId}
        onValueChange={(id) => set('locationId', id)}
        disabled={disabled || isSaving}
      />
    ),
    firstName: (
      <GridCellInput
        value={draft.firstName}
        onChange={(e) => set('firstName', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="First name"
      />
    ),
    lastName: (
      <GridCellInput
        value={draft.lastName}
        onChange={(e) => set('lastName', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Last name"
      />
    ),
    contact: (
      <GridCellContactInput
        value={draft.contact}
        onChange={(next) => set('contact', next)}
        slots={CANDIDATE_CONTACT_SLOTS}
        disabled={disabled || isSaving}
      />
    ),
    // Writes a contact-history row, not a field on the candidate — the column
    // is a live view of the latest one (see `onCreate`).
    notes: (
      <GridCellInput
        value={draft.notes}
        onChange={(e) => set('notes', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Notes"
      />
    ),
    currentSalary: (
      <GridCellInput
        value={draft.currentSalary}
        onChange={(e) => set('currentSalary', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Current salary"
      />
    ),
    expectedSalary: (
      <GridCellInput
        value={draft.expectedSalary}
        onChange={(e) => set('expectedSalary', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Expected salary"
      />
    ),
  };

  return {
    editors,
    onCommit: handleCommit,
    onReset: () => setDraft(freshDraft()),
    canCommit,
    isSaving,
    onInvalidCommit: () => {
      if (disabled) return;
      const missing = [
        draft.locationId ? null : 'Location',
        draft.industryId ? null : 'Industry',
      ].filter(Boolean);
      toast.error(`${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required`);
    },
  };
}
