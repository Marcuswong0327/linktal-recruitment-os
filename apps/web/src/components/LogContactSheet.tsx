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

interface LogContactSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who this contact is with, e.g. a stakeholder or candidate's name — shown in the sheet description. */
  subjectLabel: string;
  isSaving: boolean;
  onSave: (values: LogContactValues) => void;
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
export function LogContactSheet({ open, onOpenChange, subjectLabel, isSaving, onSave }: LogContactSheetProps) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Log a contact</SheetTitle>
            <SheetDescription>Record a contact with {subjectLabel}.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
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
            <Button type="submit" size="lg" disabled={isSaving}>
              {isSaving ? 'Logging…' : 'Log contact'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
