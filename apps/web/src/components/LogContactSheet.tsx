'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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

interface LogContactSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who this contact is with, e.g. a stakeholder or candidate's name — shown in the sheet description. Ignored when `subjectPicker` is set, since the subject isn't known until picked. */
  subjectLabel?: string;
  isSaving: boolean;
  onSave: (values: LogContactValues) => void;
  /** When the caller doesn't already know who the contact is with (e.g. logging from a company page that covers several stakeholders) — renders a required picker field above Contact method, and the picked value drives the description text instead of `subjectLabel`. */
  subjectPicker?: LogContactSubjectPicker;
}

function toLocalDatetimeInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Shared "log a contact" form for Stakeholders and Candidates — same shape
 * on both sides (contact method, when, notes); `contactedById` is never
 * collected here, since the backend always attributes it to whoever is
 * actually submitting the request (the logged-in consultant), not a
 * manually picked value.
 */
export function LogContactSheet({
  open,
  onOpenChange,
  subjectLabel,
  isSaving,
  onSave,
  subjectPicker,
}: LogContactSheetProps) {
  const [contactType, setContactType] = React.useState<string>(contactTypeOptions[0].value);
  const [notes, setNotes] = React.useState('');
  const [contactedAt, setContactedAt] = React.useState(() => toLocalDatetimeInputValue(new Date()));

  // Reset to fresh defaults every time the sheet opens (not just on first
  // mount) — otherwise a second contact logged in the same session would
  // start from whatever was left over from the previous one.
  React.useEffect(() => {
    if (!open) return;
    setContactType(contactTypeOptions[0].value);
    setNotes('');
    setContactedAt(toLocalDatetimeInputValue(new Date()));
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      contactType,
      notes: notes.trim() || null,
      contactedAt: new Date(contactedAt).toISOString(),
    });
  }

  const pickedLabel = subjectPicker?.options.find((o) => o.value === subjectPicker.value)?.label;
  const description = subjectPicker
    ? pickedLabel
      ? `Record a contact with ${pickedLabel}.`
      : 'Pick who this contact is with.'
    : `Record a contact with ${subjectLabel}.`;
  const canSubmit = !isSaving && (!subjectPicker || subjectPicker.value !== '');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Log a contact</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
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
            <FormField label="Notes" htmlFor="contact-notes">
              <textarea
                id="contact-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
              />
            </FormField>
          </div>

          <SheetFooter className="flex-row justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={!canSubmit}>
              {isSaving ? 'Logging…' : 'Log contact'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
