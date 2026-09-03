'use client';

import * as React from 'react';

import { InlineAddRow } from '@/components/InlineAddRow';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import type { ContactType } from '@/lib/contact-types';

export interface LogContactValues {
  contactType: string;
  notes: string | null;
  /** Date-only, YYYY-MM-DD — no time component (client decision, feedback item 14). */
  contactedAt: string;
}

export interface LogContactSubjectPicker {
  label: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
}

interface LogContactRowProps {
  /** Must match the number of columns in the table this row sits in. */
  colSpan: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerDisabled?: boolean;
  isSaving: boolean;
  onSave: (values: LogContactValues) => void;
  /** When the caller doesn't already know who the contact is with (e.g. logging from a company page that covers several stakeholders) — renders a required picker field ahead of the date. */
  subjectPicker?: LogContactSubjectPicker;
}

function toLocalDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Client decision (feedback item 14): Contact Method is no longer a field in
// this form — every contact logged here defaults to a call. Typed against the
// shared vocabulary so it stays a value the API's @IsIn(CONTACT_TYPES) accepts.
const DEFAULT_CONTACT_TYPE: ContactType = 'call';

/**
 * Shared "log a contact" inline row for stakeholder contact history — used by
 * StakeholderDetail (one known stakeholder) and CompanyDetail (which picks one
 * of the client's stakeholders via `subjectPicker`). Candidates have their own
 * `LogCandidateContactRow`, since they carry a screening/outreach category this
 * form doesn't. `contactedById` is never collected here: the backend always
 * attributes it to whoever is actually submitting the request (the logged-in
 * consultant), not a manually picked value.
 */
export function LogContactRow({
  colSpan,
  open,
  onOpenChange,
  triggerDisabled,
  isSaving,
  onSave,
  subjectPicker,
}: LogContactRowProps) {
  const [notes, setNotes] = React.useState('');
  const [contactedAt, setContactedAt] = React.useState(() => toLocalDateInputValue(new Date()));

  // Reset to fresh defaults every time the row opens (not just on first
  // mount) — otherwise a second contact logged in the same session would
  // start from whatever was left over from the previous one.
  React.useEffect(() => {
    if (!open) return;
    setNotes('');
    setContactedAt(toLocalDateInputValue(new Date()));
  }, [open]);

  function handleSave() {
    onSave({
      contactType: DEFAULT_CONTACT_TYPE,
      notes: notes.trim() || null,
      contactedAt,
    });
  }

  const canSave = !subjectPicker || subjectPicker.value !== '';

  return (
    <InlineAddRow
      colSpan={colSpan}
      open={open}
      onOpenChange={onOpenChange}
      triggerDisabled={triggerDisabled}
      triggerLabel="Log a new contact"
      isSaving={isSaving}
      onSave={handleSave}
      canSave={canSave}
      saveLabel="Log contact"
      savingLabel="Logging…"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {subjectPicker ? (
          <FormField label={subjectPicker.label} htmlFor="contact-subject" required>
            <EnumSelect
              id="contact-subject"
              value={subjectPicker.value}
              onValueChange={subjectPicker.onValueChange}
              options={subjectPicker.options}
              placeholder={subjectPicker.placeholder}
            />
          </FormField>
        ) : null}
        <FormField
          label="When"
          htmlFor="contact-date"
          required
          description="Defaults to today — change this to log a past contact."
        >
          <input
            id="contact-date"
            type="date"
            value={contactedAt}
            onChange={(e) => setContactedAt(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
          />
        </FormField>
      </div>
      <FormField label="Notes" htmlFor="contact-notes">
        <textarea
          id="contact-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
        />
      </FormField>
    </InlineAddRow>
  );
}
