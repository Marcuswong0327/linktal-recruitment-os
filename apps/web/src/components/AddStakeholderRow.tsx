'use client';

import * as React from 'react';

import { InlineAddRow } from '@/components/InlineAddRow';
import { Input } from '@/components/ui/input';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import { accuracyOptions } from '@/features/stakeholders/columns';

export interface AddStakeholderValues {
  firstName: string;
  lastName: string;
  jobTitleId: string;
  roleTypeId: string;
  linkedinUrl: string;
  email: string;
  mobile: string;
  coverage: LocationOption[];
  isAccurate: boolean | null;
  inaccurateReason: string;
}

interface AddStakeholderRowProps {
  /** Must match the number of columns in the table this row sits in. */
  colSpan: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleTypes: CreatableComboboxOption[];
  onCreateRoleType: (name: string) => Promise<CreatableComboboxOption>;
  jobTitles: CreatableComboboxOption[];
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  isSaving: boolean;
  onSave: (values: AddStakeholderValues) => void;
}

const emptyValues: AddStakeholderValues = {
  firstName: '',
  lastName: '',
  jobTitleId: '',
  roleTypeId: '',
  linkedinUrl: '',
  email: '',
  mobile: '',
  coverage: [],
  isAccurate: null,
  inaccurateReason: '',
};

/** Add a new stakeholder for this company — inline row on the company detail page's Stakeholders table. `clientId` isn't collected here since it's always this company. */
export function AddStakeholderRow({
  colSpan,
  open,
  onOpenChange,
  roleTypes,
  onCreateRoleType,
  jobTitles,
  onCreateJobTitle,
  isSaving,
  onSave,
}: AddStakeholderRowProps) {
  const [values, setValues] = React.useState(emptyValues);

  // Reset every time the row opens, not just on first mount.
  React.useEffect(() => {
    if (open) setValues(emptyValues);
  }, [open]);

  function set<K extends keyof AddStakeholderValues>(key: K, value: AddStakeholderValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <InlineAddRow
      colSpan={colSpan}
      open={open}
      onOpenChange={onOpenChange}
      triggerLabel="Add a new stakeholder"
      isSaving={isSaving}
      onSave={() => onSave(values)}
      saveLabel="Add stakeholder"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="First name" htmlFor="stakeholder-first-name">
          <Input
            id="stakeholder-first-name"
            value={values.firstName}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </FormField>
        <FormField label="Last name" htmlFor="stakeholder-last-name">
          <Input
            id="stakeholder-last-name"
            value={values.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </FormField>
        <FormField label="Job title" htmlFor="stakeholder-job-title">
          <CreatableCombobox
            id="stakeholder-job-title"
            value={values.jobTitleId}
            onValueChange={(id) => set('jobTitleId', id)}
            options={jobTitles}
            onCreate={onCreateJobTitle}
          />
        </FormField>
        <FormField label="Role type" htmlFor="stakeholder-role-type">
          <CreatableCombobox
            id="stakeholder-role-type"
            value={values.roleTypeId}
            onValueChange={(id) => set('roleTypeId', id)}
            options={roleTypes}
            onCreate={onCreateRoleType}
          />
        </FormField>
        <FormField label="LinkedIn URL" htmlFor="stakeholder-linkedin">
          <Input
            id="stakeholder-linkedin"
            value={values.linkedinUrl}
            onChange={(e) => set('linkedinUrl', e.target.value)}
          />
        </FormField>
        <FormField label="Email" htmlFor="stakeholder-email">
          <Input
            id="stakeholder-email"
            type="email"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </FormField>
        <FormField label="Mobile" htmlFor="stakeholder-mobile">
          <Input
            id="stakeholder-mobile"
            value={values.mobile}
            onChange={(e) => set('mobile', e.target.value)}
          />
        </FormField>
        <FormField
          label="Details accurate"
          htmlFor="stakeholder-accurate"
          description="Whether these contact details have been verified."
        >
          <EnumSelect
            id="stakeholder-accurate"
            value={values.isAccurate === null ? 'unchecked' : String(values.isAccurate)}
            onValueChange={(v) => set('isAccurate', v === 'unchecked' ? null : v === 'true')}
            options={accuracyOptions}
          />
        </FormField>
      </div>
      <FormField
        label="Coverage"
        htmlFor="stakeholder-coverage"
        description="Which places this contact covers. Optional — can be set later from their detail page."
      >
        <LocationMultiSelect
          id="stakeholder-coverage"
          selected={values.coverage}
          onChange={(coverage) => set('coverage', coverage)}
        />
      </FormField>
      {values.isAccurate === false ? (
        <FormField label="What's wrong" htmlFor="stakeholder-inaccurate-reason">
          <textarea
            id="stakeholder-inaccurate-reason"
            value={values.inaccurateReason}
            onChange={(e) => set('inaccurateReason', e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
          />
        </FormField>
      ) : null}
    </InlineAddRow>
  );
}
