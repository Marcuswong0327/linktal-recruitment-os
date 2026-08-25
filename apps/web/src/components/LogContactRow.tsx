'use client';

import * as React from 'react';

import { InlineAddRow } from '@/components/InlineAddRow';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { contactTypeOptions } from '@/lib/contact-types';

export interface LogContactValues {
  contactType: string;
  notes: string | null;
  /** ISO 8601 */
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
  /** When the caller doesn't already know who the contact is with (e.g. logging from a company page that covers several stakeholders) — renders a required picker field above Contact method. */
  subjectPicker?: LogContactSubjectPicker;
}

function toLocalDatetimeInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Shared "log a contact" inline row for Stakeholders and Candidates — same
 * shape on both sides (contact method, when, notes); `contactedById` is never
 * collected here, since the backend always attributes it to whoever is
 * actually submitting the request (the logged-in consultant), not a
 * manually picked value.
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
  const [contactType, setContactType] = React.useState<string>(contactTypeOptions[0].value);
  const [notes, setNotes] = React.useState('');
  const [contactedAt, setContactedAt] = React.useState(() => toLocalDatetimeInputValue(new Date()));

  // Reset to fresh defaults every time the row opens (not just on first
  // mount) — otherwise a second contact logged in the same session would
  // start from whatever was left over from the previous one.
  React.useEffect(() => {
    if (!open) return;
    setContactType(contactTypeOptions[0].value);
    setNotes('');
    setContactedAt(toLocalDatetimeInputValue(new Date()));
  }, [open]);

  function handleSave() {
    onSave({
      contactType,
      notes: notes.trim() || null,
      contactedAt: new Date(contactedAt).toISOString(),
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
        <FormField label="Contact method" htmlFor="contact-type" required>
          <EnumSelect
            id="contact-type"
            value={contactType}
            onValueChange={setContactType}
            options={contactTypeOptions}
          />
        </FormField>
        <FormField
          label="When"
          htmlFor="contact-date"
          required
          description="Defaults to now — change this to log a past contact."
        >
          <input
            id="contact-date"
            type="datetime-local"
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
