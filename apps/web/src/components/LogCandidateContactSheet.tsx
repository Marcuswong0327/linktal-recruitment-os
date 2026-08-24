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
import {
  contactCategoryOptions,
  outreachChannelOptions,
  type ContactCategory,
  type OutreachChannel,
} from '@/lib/candidate-contact-category';

export interface LogCandidateContactValues {
  contactType: string;
  category: ContactCategory;
  screeningNotes: string | null;
  outreachCampaignNotes: string | null;
  outreachChannel: OutreachChannel | null;
  /** ISO 8601 */
  contactedAt: string;
  /** Free text, e.g. "35 per hour" — see CandidateContactHistory.currentSalary. */
  currentSalary: string | null;
  expectedSalary: string | null;
}

interface LogCandidateContactSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectLabel: string;
  isSaving: boolean;
  onSave: (values: LogCandidateContactValues) => void;
}

function toLocalDatetimeInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Candidate-specific "log a contact" form — a separate component from the
 * shared `LogContactSheet` (used verbatim by Stakeholders) because Candidates
 * carry a category distinction (screening vs. outreach) Stakeholders don't:
 * a SCREENING entry collects free-text `screeningNotes`; an OUTREACH entry
 * collects an optional `outreachChannel` (SMS/Email) plus free-text
 * `outreachCampaignNotes` (which campaign/job, not which channel).
 */
export function LogCandidateContactSheet({
  open,
  onOpenChange,
  subjectLabel,
  isSaving,
  onSave,
}: LogCandidateContactSheetProps) {
  const [contactType, setContactType] = React.useState<string>(contactTypeOptions[0].value);
  const [category, setCategory] = React.useState<ContactCategory>(contactCategoryOptions[0].value);
  const [screeningNotes, setScreeningNotes] = React.useState('');
  const [outreachCampaignNotes, setOutreachCampaignNotes] = React.useState('');
  const [outreachChannel, setOutreachChannel] = React.useState<OutreachChannel | ''>('');
  const [contactedAt, setContactedAt] = React.useState(() => toLocalDatetimeInputValue(new Date()));
  const [currentSalary, setCurrentSalary] = React.useState('');
  const [expectedSalary, setExpectedSalary] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setContactType(contactTypeOptions[0].value);
    setCategory(contactCategoryOptions[0].value);
    setScreeningNotes('');
    setOutreachCampaignNotes('');
    setOutreachChannel('');
    setContactedAt(toLocalDatetimeInputValue(new Date()));
    setCurrentSalary('');
    setExpectedSalary('');
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      contactType,
      category,
      screeningNotes: category === 'SCREENING' ? screeningNotes.trim() || null : null,
      outreachCampaignNotes: category === 'OUTREACH' ? outreachCampaignNotes.trim() || null : null,
      outreachChannel: category === 'OUTREACH' && outreachChannel ? outreachChannel : null,
      contactedAt: new Date(contactedAt).toISOString(),
      currentSalary: currentSalary.trim() || null,
      expectedSalary: expectedSalary.trim() || null,
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
            <FormField label="Kind of note" htmlFor="contact-category" required>
              <EnumSelect
                id="contact-category"
                value={category}
                onValueChange={(v) => setCategory(v as ContactCategory)}
                options={contactCategoryOptions}
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
            <FormField
              label="Current salary"
              htmlFor="current-salary"
              description={'Free text, e.g. "35 per hour" — leave blank if unknown.'}
            >
              <input
                id="current-salary"
                type="text"
                value={currentSalary}
                onChange={(e) => setCurrentSalary(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
              />
            </FormField>
            <FormField label="Expected salary" htmlFor="expected-salary">
              <input
                id="expected-salary"
                type="text"
                value={expectedSalary}
                onChange={(e) => setExpectedSalary(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
              />
            </FormField>

            {category === 'SCREENING' ? (
              <FormField label="Screening notes" htmlFor="screening-notes">
                <textarea
                  id="screening-notes"
                  value={screeningNotes}
                  onChange={(e) => setScreeningNotes(e.target.value)}
                  className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
                />
              </FormField>
            ) : (
              <>
                <FormField
                  label="Channel"
                  htmlFor="outreach-channel"
                  description="Leave unset if the channel isn't known."
                >
                  <EnumSelect
                    id="outreach-channel"
                    value={outreachChannel}
                    onValueChange={(v) => setOutreachChannel(v as OutreachChannel)}
                    options={outreachChannelOptions}
                    placeholder="Not set"
                  />
                </FormField>
                <FormField label="Campaign notes" htmlFor="outreach-notes" description="Which campaign or job, e.g. context for the outreach.">
                  <textarea
                    id="outreach-notes"
                    value={outreachCampaignNotes}
                    onChange={(e) => setOutreachCampaignNotes(e.target.value)}
                    className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
                  />
                </FormField>
              </>
            )}
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
