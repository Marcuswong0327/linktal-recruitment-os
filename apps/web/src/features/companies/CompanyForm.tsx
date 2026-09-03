'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import { SpecializationCombobox, type SpecializationOption } from '@/components/SpecializationPicker';
import type { CreateClientDto } from '@/lib/api/generated/types';
import { qualityOptions, statusOptions, type ClientQuality, type ClientStatus } from './schema';

/** Editable fields shared by the create sheet. Editing an existing company happens on its detail page. */
export interface CompanyFormValues {
  companyName: string;
  industryId: string;
  specializationId: string;
  locations: LocationOption[];
  addresses: string;
  website: string;
  seekJobMarketUrl: string;
  linkedinJobMarketUrl: string;
  generalDescription: string;
  status: ClientStatus;
  quality: ClientQuality;
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildCompanyPayload(values: CompanyFormValues): CreateClientDto {
  return {
    companyName: values.companyName,
    industryId: values.industryId,
    specializationId: values.specializationId || undefined,
    locationIds: values.locations.map((l) => l.id),
    addresses: values.addresses ? splitLines(values.addresses) : undefined,
    website: values.website || undefined,
    seekJobMarketUrl: values.seekJobMarketUrl || undefined,
    linkedinJobMarketUrl: values.linkedinJobMarketUrl || undefined,
    generalDescription: values.generalDescription || undefined,
    status: values.status,
    quality: values.quality,
  };
}

/** "Add company" drawer form — company name, industry and at least one market location are required (mirrors CreateClientDto). Editing an existing company happens on its detail page (/companies/[id]), not here. */
export function CompanyForm({
  title,
  description,
  industries,
  onCreateIndustry,
  onCreateSpecialization,
  isSaving,
  onSave,
  onCancel,
}: {
  title: string;
  description: string;
  industries: { id: string; name: string }[];
  onCreateIndustry: (name: string) => Promise<{ id: string; name: string }>;
  onCreateSpecialization: (name: string, industryId: string) => Promise<SpecializationOption>;
  isSaving: boolean;
  onSave: (values: CompanyFormValues) => void;
  onCancel: () => void;
}) {
  const [companyName, setCompanyName] = React.useState('');
  const [industryId, setIndustryId] = React.useState('');
  const [specializationId, setSpecializationId] = React.useState('');
  const [locations, setLocations] = React.useState<LocationOption[]>([]);
  const [addresses, setAddresses] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [seekJobMarketUrl, setSeekJobMarketUrl] = React.useState('');
  const [linkedinJobMarketUrl, setLinkedinJobMarketUrl] = React.useState('');
  const [generalDescription, setGeneralDescription] = React.useState('');
  const [status, setStatus] = React.useState<ClientStatus>('COLD');
  const [quality, setQuality] = React.useState<ClientQuality>('MEDIUM');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      companyName,
      industryId,
      specializationId,
      locations,
      addresses,
      website,
      seekJobMarketUrl,
      linkedinJobMarketUrl,
      generalDescription,
      status,
      quality,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company name" htmlFor="company-name" required>
          <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </FormField>
        <FormField label="Industry" htmlFor="company-industry" required>
          <CreatableCombobox
            id="company-industry"
            value={industryId}
            onValueChange={(id) => {
              setIndustryId(id);
              setSpecializationId('');
            }}
            options={industries}
            onCreate={onCreateIndustry}
          />
        </FormField>
        <FormField
          label="Specialization"
          htmlFor="company-specialization"
          description={!industryId ? 'Pick an industry first' : undefined}
        >
          <SpecializationCombobox
            id="company-specialization"
            value={specializationId}
            onValueChange={setSpecializationId}
            industryId={industryId || undefined}
            onCreate={(name) => onCreateSpecialization(name, industryId)}
            disabled={!industryId}
            clearable
          />
        </FormField>
        <FormField
          label="City Coverage"
          htmlFor="company-market"
          required
          description="Which places this client hires from, not its office address."
        >
          <LocationMultiSelect
            id="company-market"
            selected={locations}
            onChange={setLocations}
            placeholder="Search locations…"
          />
        </FormField>
        <FormField label="Website" htmlFor="company-website">
          <Input id="company-website" type="url" placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </FormField>
        <FormField
          label="Status"
          htmlFor="company-status"
          description="Relationship status. Defaults to Cold for a new lead."
        >
          <EnumSelect id="company-status" value={status} onValueChange={(v) => setStatus(v as ClientStatus)} options={statusOptions} />
        </FormField>
        <FormField label="Quality" htmlFor="company-quality" description="A subjective read on how good a prospect this is.">
          <EnumSelect id="company-quality" value={quality} onValueChange={(v) => setQuality(v as ClientQuality)} options={qualityOptions} />
        </FormField>
        <FormField label="Office address(es)" htmlFor="company-addresses" description="One per line — distinct from City Coverage above.">
          <textarea
            id="company-addresses"
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
        <FormField label="Seek / Job Street URL" htmlFor="company-seek">
          <Input id="company-seek" type="url" placeholder="https://…" value={seekJobMarketUrl} onChange={(e) => setSeekJobMarketUrl(e.target.value)} />
        </FormField>
        <FormField label="LinkedIn job market URL" htmlFor="company-linkedin">
          <Input
            id="company-linkedin"
            type="url"
            placeholder="https://…"
            value={linkedinJobMarketUrl}
            onChange={(e) => setLinkedinJobMarketUrl(e.target.value)}
          />
        </FormField>
        <FormField label="Description" htmlFor="company-description">
          <textarea
            id="company-description"
            value={generalDescription}
            onChange={(e) => setGeneralDescription(e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving || !companyName || !industryId || locations.length === 0}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </SheetFooter>
    </form>
  );
}
