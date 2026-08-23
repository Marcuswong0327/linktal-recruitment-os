'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ClientCombobox } from '@/components/ClientCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import type { ClientEntity, CreateJobResearchDto } from '@/lib/api/generated/types';

/** Editable fields for the create sheet. Editing an existing research row happens inline in its table row / a future detail view. */
export interface JobResearchFormValues {
  clientId: string;
  location: LocationOption | null;
  jobTitleId: string;
  salaryRange: string;
  postedDate: string;
  seekUrl: string;
  permanentUrl: string;
}

export function buildJobResearchPayload(values: JobResearchFormValues): CreateJobResearchDto {
  return {
    clientId: values.clientId,
    locationId: values.location?.id || undefined,
    jobTitleId: values.jobTitleId || undefined,
    salaryRange: values.salaryRange || undefined,
    postedDate: values.postedDate || undefined,
    seekUrl: values.seekUrl || undefined,
    permanentUrl: values.permanentUrl || undefined,
  };
}

/** "Add job order" drawer form — logs a job ad found in the market against a company (mirrors CreateJobResearchDto). Only Company is required. */
export function JobResearchForm({
  title,
  description,
  clients,
  jobTitles,
  onCreateJobTitle,
  isSaving,
  onSave,
  onCancel,
}: {
  title: string;
  description: string;
  clients: ClientEntity[];
  jobTitles: { id: string; name: string }[];
  onCreateJobTitle: (name: string) => Promise<{ id: string; name: string }>;
  isSaving: boolean;
  onSave: (values: JobResearchFormValues) => void;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = React.useState('');
  const [location, setLocation] = React.useState<LocationOption | null>(null);
  const [jobTitleId, setJobTitleId] = React.useState('');
  const [salaryRange, setSalaryRange] = React.useState('');
  const [postedDate, setPostedDate] = React.useState('');
  const [seekUrl, setSeekUrl] = React.useState('');
  const [permanentUrl, setPermanentUrl] = React.useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ clientId, location, jobTitleId, salaryRange, postedDate, seekUrl, permanentUrl });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company" htmlFor="research-client" required>
          <ClientCombobox id="research-client" value={clientId} onValueChange={setClientId} clients={clients} />
        </FormField>
        <FormField label="Job title" htmlFor="research-job-title" description="The advertiser's own words.">
          <CreatableCombobox
            id="research-job-title"
            value={jobTitleId}
            onValueChange={setJobTitleId}
            options={jobTitles}
            onCreate={onCreateJobTitle}
            clearable
          />
        </FormField>
        <FormField label="Location" htmlFor="research-location">
          <LocationMultiSelect
            id="research-location"
            selected={location ? [location] : []}
            onChange={(next) => setLocation(next.length ? next[next.length - 1] : null)}
            placeholder="Search locations…"
          />
        </FormField>
        <FormField label="Salary" htmlFor="research-salary" description="Free text, copied verbatim from the ad.">
          <Input
            id="research-salary"
            placeholder="salary + super + FMCV + bonus scheme"
            value={salaryRange}
            onChange={(e) => setSalaryRange(e.target.value)}
          />
        </FormField>
        <FormField label="Posted date" htmlFor="research-posted-date">
          <Input id="research-posted-date" type="date" value={postedDate} onChange={(e) => setPostedDate(e.target.value)} />
        </FormField>
        <FormField label="Seek URL" htmlFor="research-seek-url">
          <Input id="research-seek-url" type="url" placeholder="https://…" value={seekUrl} onChange={(e) => setSeekUrl(e.target.value)} />
        </FormField>
        <FormField label="Permanent URL" htmlFor="research-permanent-url" description="Archived link, if the original expires.">
          <Input
            id="research-permanent-url"
            type="url"
            placeholder="https://…"
            value={permanentUrl}
            onChange={(e) => setPermanentUrl(e.target.value)}
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving || !clientId}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </SheetFooter>
    </form>
  );
}
