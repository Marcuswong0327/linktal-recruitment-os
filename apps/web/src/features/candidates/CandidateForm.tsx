'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import type { CreateCandidateDto } from '@/lib/api/generated/types';
import { candidateStatusLabels, candidateStatusTriggerClassName, candidateStatuses, type CandidateStatus } from './schema';

const statusOptions = candidateStatuses.map((value) => ({
  value,
  label: candidateStatusLabels[value],
  triggerClassName: candidateStatusTriggerClassName[value],
}));

/** Editable fields shared by the create sheet. Editing an existing candidate happens on its detail page. */
export interface CandidateFormValues {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  location: LocationOption | null;
  industryId: string;
  jobRoleTypeId: string;
  currentRole: string;
  currentCompany: string;
  linkedinUrl: string;
  status: CandidateStatus;
}

export function buildCandidatePayload(values: CandidateFormValues): CreateCandidateDto {
  return {
    firstName: values.firstName || undefined,
    lastName: values.lastName || undefined,
    email: values.email || undefined,
    mobile: values.mobile || undefined,
    locationId: values.location!.id,
    industryId: values.industryId,
    jobRoleTypeId: values.jobRoleTypeId || undefined,
    currentRole: values.currentRole || undefined,
    currentCompany: values.currentCompany || undefined,
    linkedinUrl: values.linkedinUrl || undefined,
    status: values.status,
  };
}

/** "Add candidate" drawer form — location and industry are required (mirrors CreateCandidateDto). Editing an existing candidate happens on its detail page (/candidates/[id]), not here. */
export function CandidateForm({
  title,
  description,
  industries,
  roleTypes,
  onCreateIndustry,
  onCreateRoleType,
  isSaving,
  onSave,
  onCancel,
}: {
  title: string;
  description: string;
  industries: { id: string; name: string }[];
  roleTypes: { id: string; name: string }[];
  onCreateIndustry: (name: string) => Promise<{ id: string; name: string }>;
  onCreateRoleType: (name: string) => Promise<{ id: string; name: string }>;
  isSaving: boolean;
  onSave: (values: CandidateFormValues) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [mobile, setMobile] = React.useState('');
  const [location, setLocation] = React.useState<LocationOption | null>(null);
  const [industryId, setIndustryId] = React.useState('');
  const [jobRoleTypeId, setJobRoleTypeId] = React.useState('');
  const [currentRole, setCurrentRole] = React.useState('');
  const [currentCompany, setCurrentCompany] = React.useState('');
  const [linkedinUrl, setLinkedinUrl] = React.useState('');
  const [status, setStatus] = React.useState<CandidateStatus>('COLD');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      firstName,
      lastName,
      email,
      mobile,
      location,
      industryId,
      jobRoleTypeId,
      currentRole,
      currentCompany,
      linkedinUrl,
      status,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="First name" htmlFor="candidate-first-name">
            <Input id="candidate-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="Last name" htmlFor="candidate-last-name">
            <Input id="candidate-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Email" htmlFor="candidate-email">
          <Input id="candidate-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Mobile" htmlFor="candidate-mobile">
          <Input id="candidate-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </FormField>
        <FormField
          label="Location"
          htmlFor="candidate-location"
          required
          description="Most specific place known — city if no suburb is known, and so on."
        >
          <LocationMultiSelect
            id="candidate-location"
            selected={location ? [location] : []}
            onChange={(next) => setLocation(next.length ? next[next.length - 1] : null)}
            placeholder="Search locations…"
          />
        </FormField>
        <FormField label="Industry" htmlFor="candidate-industry" required>
          <CreatableCombobox
            id="candidate-industry"
            value={industryId}
            onValueChange={setIndustryId}
            options={industries}
            onCreate={onCreateIndustry}
          />
        </FormField>
        <FormField label="Role type" htmlFor="candidate-role-type" description="The role Linktal is placing them into.">
          <CreatableCombobox
            id="candidate-role-type"
            value={jobRoleTypeId}
            onValueChange={setJobRoleTypeId}
            options={roleTypes}
            onCreate={onCreateRoleType}
            clearable
          />
        </FormField>
        <FormField label="Current title" htmlFor="candidate-current-role" description="In the employer's own words.">
          <Input id="candidate-current-role" value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} />
        </FormField>
        <FormField label="Current company" htmlFor="candidate-current-company">
          <Input
            id="candidate-current-company"
            value={currentCompany}
            onChange={(e) => setCurrentCompany(e.target.value)}
          />
        </FormField>
        <FormField label="LinkedIn URL" htmlFor="candidate-linkedin">
          <Input
            id="candidate-linkedin"
            type="url"
            placeholder="https://…"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
        </FormField>
        <FormField label="Status" htmlFor="candidate-status" description="Defaults to Cold for a new candidate.">
          <EnumSelect id="candidate-status" value={status} onValueChange={(v) => setStatus(v as CandidateStatus)} options={statusOptions} />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving || !industryId || !location}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </SheetFooter>
    </form>
  );
}
