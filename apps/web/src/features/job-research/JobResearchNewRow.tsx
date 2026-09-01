'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { GridCellClientCombobox } from '@/components/GridCellClientCombobox';
import { GridCellCombobox } from '@/components/GridCellCombobox';
import { GridCellLinkInput } from '@/components/GridCellLinkInput';
import { GridCellInput } from '@/components/GridCellInput';
import { GridCellLocationCombobox } from '@/components/GridCellLocationCombobox';
import { focusNewRowStart, type DataGridNewRow } from '@/components/DataGrid';
import type { CreatableComboboxOption } from '@/components/CreatableCombobox';
import { useJobTitleOptions } from '@/hooks/use-catalog-options';
import type { CreateJobResearchDto } from '@/lib/api/generated/types';

interface JobResearchDraft {
  clientId: string;
  jobTitleId: string;
  locationId: string;
  salaryRange: string;
  postedDate: string;
  seekUrl: string;
  permanentUrl: string;
}

const emptyDraft: JobResearchDraft = {
  clientId: '',
  jobTitleId: '',
  locationId: '',
  salaryRange: '',
  postedDate: '',
  seekUrl: '',
  permanentUrl: '',
};

/**
 * Today as `YYYY-MM-DD` in the user's own timezone — what `<input type="date">`
 * reads and writes. Built from the local getters rather than `toISOString()`,
 * which converts to UTC first and so reports the wrong day for anyone far
 * enough either side of it (Australia is the far side by mid-afternoon).
 */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface UseJobResearchNewRowOptions {
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  /** Persists the record. Resolve to commit and clear the row; reject to keep what was typed. */
  onCreate: (dto: CreateJobResearchDto) => Promise<void>;
  disabled?: boolean;
}

/**
 * The always-present "type a new research row here" row for Job Research —
 * see `DataGridProps.newRow`.
 *
 * `CreateJobResearchDto` requires only the client. Posted date is pre-filled
 * with today (and reset to today after each save) — research rows are logged
 * the day the ad is found — and stays editable for an older ad. `researchedAt`
 * isn't collected here at all: it already defaults to `now()` in the schema.
 *
 * The table's City and
 * Suburb columns are both projections of one `locationId` (see `cityLabel` /
 * `suburbLabel` in ./columns), so the single location picker sits in City and
 * Suburb stays blank rather than offering a second, contradictory editor for
 * the same field.
 */
export function useJobResearchNewRow({
  onCreateJobTitle,
  onCreate,
  disabled = false,
}: UseJobResearchNewRowOptions): DataGridNewRow {
  // Server-searched: the Job Titles catalog is far larger than one page
  // (see useJobTitleOptions).
  const jobTitleSearch = useJobTitleOptions();
  const [draft, setDraft] = React.useState(emptyDraft);
  const [isSaving, setIsSaving] = React.useState(false);

  // Filled after mount, not in the initial state: this component server-renders
  // too, and a date computed on the server can land on a different day from the
  // client's — a hydration mismatch. Only ever fills an empty cell.
  React.useEffect(() => {
    setDraft((d) => (d.postedDate ? d : { ...d, postedDate: todayLocal() }));
  }, []);

  function set<K extends keyof JobResearchDraft>(key: K, value: JobResearchDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const canCommit = draft.clientId !== '' && !disabled;

  async function handleCommit() {
    if (!canCommit || isSaving) return;
    setIsSaving(true);
    try {
      await onCreate({
        clientId: draft.clientId,
        ...(draft.jobTitleId ? { jobTitleId: draft.jobTitleId } : {}),
        ...(draft.locationId ? { locationId: draft.locationId } : {}),
        ...(draft.salaryRange.trim() ? { salaryRange: draft.salaryRange.trim() } : {}),
        // <input type="date"> already yields YYYY-MM-DD, which is what the
        // DTO's date string expects.
        ...(draft.postedDate ? { postedDate: draft.postedDate } : {}),
        ...(draft.seekUrl.trim() ? { seekUrl: draft.seekUrl.trim() } : {}),
        ...(draft.permanentUrl.trim() ? { permanentUrl: draft.permanentUrl.trim() } : {}),
      });
      // Back to today rather than blank — the next row is nearly always
      // logged the same day as this one.
      setDraft({ ...emptyDraft, postedDate: todayLocal() });
      requestAnimationFrame(() => focusNewRowStart());
    } catch {
      // Toasted by the caller; the draft survives a failed save.
    } finally {
      setIsSaving(false);
    }
  }

  const editors: Record<string, React.ReactNode> = {
    city: (
      <GridCellLocationCombobox
        value={draft.locationId}
        onValueChange={(id) => set('locationId', id)}
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
    companyName: (
      <GridCellClientCombobox
        value={draft.clientId}
        onValueChange={(id) => set('clientId', id)}
        disabled={disabled || isSaving}
      />
    ),
    salaryRange: (
      <GridCellInput
        value={draft.salaryRange}
        onChange={(e) => set('salaryRange', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Salary range"
      />
    ),
    postedDate: (
      <GridCellInput
        type="date"
        value={draft.postedDate}
        onChange={(e) => set('postedDate', e.target.value)}
        disabled={disabled || isSaving}
        aria-label="Posted date"
      />
    ),
    // One box for both link fields — paste and press Enter, and the URL's own
    // host decides whether it's the Seek listing or the archived copy (see
    // GridCellLinkInput, mirroring the Contact column's behaviour).
    links: (
      <GridCellLinkInput
        value={{ seekUrl: draft.seekUrl, permanentUrl: draft.permanentUrl }}
        onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
        disabled={disabled || isSaving}
      />
    ),
  };

  return {
    editors,
    onCommit: handleCommit,
    onReset: () => setDraft({ ...emptyDraft, postedDate: todayLocal() }),
    canCommit,
    isSaving,
    onInvalidCommit: () => {
      if (disabled) return;
      toast.error('Company is required');
    },
  };
}
