'use client';

import * as React from 'react';

import { InlineAddRow } from '@/components/InlineAddRow';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/ui/input';
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

interface LogCandidateContactRowProps {
  /** Must match the number of columns in the table this row sits in. */
  colSpan: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  onSave: (values: LogCandidateContactValues) => void;
}

function toLocalDatetimeInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Candidate-specific "log a contact" inline row — a separate component from
 * the shared `LogContactRow` (used verbatim by Stakeholders) because
 * Candidates carry a category distinction (screening vs. outreach)
 * Stakeholders don't: a SCREENING entry collects free-text `screeningNotes`;
 * an OUTREACH entry collects an optional `outreachChannel` (SMS/Email) plus
 * free-text `outreachCampaignNotes` (which campaign/job, not which channel).
 */
export function LogCandidateContactRow({
  colSpan,
  open,
  onOpenChange,
  isSaving,
  onSave,
}: LogCandidateContactRowProps) {
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

  function handleSave() {
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
    <InlineAddRow
      colSpan={colSpan}
      open={open}
      onOpenChange={onOpenChange}
      triggerLabel="Log a new contact"
      isSaving={isSaving}
      onSave={handleSave}
      saveLabel="Log contact"
      savingLabel="Logging…"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <Input
            id="current-salary"
            value={currentSalary}
            onChange={(e) => setCurrentSalary(e.target.value)}
          />
        </FormField>
        <FormField label="Expected salary" htmlFor="expected-salary">
          <Input
            id="expected-salary"
            value={expectedSalary}
            onChange={(e) => setExpectedSalary(e.target.value)}
          />
        </FormField>
        {category === 'OUTREACH' ? (
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
        ) : null}
      </div>

      {category === 'SCREENING' ? (
        <FormField label="Screening notes" htmlFor="screening-notes">
          <textarea
            id="screening-notes"
            value={screeningNotes}
            onChange={(e) => setScreeningNotes(e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
      ) : (
        <FormField
          label="Campaign notes"
          htmlFor="outreach-notes"
          description="Which campaign or job, e.g. context for the outreach."
        >
          <textarea
            id="outreach-notes"
            value={outreachCampaignNotes}
            onChange={(e) => setOutreachCampaignNotes(e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
      )}
    </InlineAddRow>
  );
}
