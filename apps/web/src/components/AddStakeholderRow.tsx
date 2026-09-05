'use client';

import * as React from 'react';

import { ClientCombobox } from '@/components/ClientCombobox';
import { InlineAddRow } from '@/components/InlineAddRow';
import { Input } from '@/components/ui/input';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { useJobTitleOptions } from '@/hooks/use-catalog-options';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import { accuracyOptions } from '@/features/stakeholders/columns';

export interface AddStakeholderValues {
  clientId: string;
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
  triggerDisabled?: boolean;
  /**
   * Company roster — passing this renders a required "Company" picker, for
   * callers not already scoped to one company (e.g. the standalone
   * Stakeholders list). Omit it (as CompanyDetail's own stakeholders
   * sub-table does) to leave `clientId` out of the form entirely; the caller
   * sets it itself from page context.
   */
  /** Renders the compact inline layout with a Company picker — the standalone Stakeholders list. Omit for CompanyDetail's sub-table, where the client is implicit. */
  withClientPicker?: boolean;
  roleTypes: CreatableComboboxOption[];
  onCreateRoleType: (name: string) => Promise<CreatableComboboxOption>;
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  isSaving: boolean;
  onSave: (values: AddStakeholderValues) => void;
}

const emptyValues: AddStakeholderValues = {
  clientId: '',
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

/**
 * Add a new stakeholder — reused as CompanyDetail's own "add a stakeholder
 * for this company" sub-table row (no `withClientPicker`; `clientId` isn't
 * collected here since it's always this company) and as the standalone
 * Stakeholders list's quick-add row (`clients` passed, Company + Name are
 * the two critical fields — see issue #131).
 */
export function AddStakeholderRow({
  colSpan,
  open,
  onOpenChange,
  triggerDisabled,
  withClientPicker,
  roleTypes,
  onCreateRoleType,
  onCreateJobTitle,
  isSaving,
  onSave,
}: AddStakeholderRowProps) {
  // Server-searched: the Job Titles catalog is far larger than one page
  // (see useJobTitleOptions).
  const jobTitleSearch = useJobTitleOptions();
  const [values, setValues] = React.useState(emptyValues);

  // Reset every time the row opens, not just on first mount.
  React.useEffect(() => {
    if (open) setValues(emptyValues);
  }, [open]);

  function set<K extends keyof AddStakeholderValues>(key: K, value: AddStakeholderValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  // Standalone Stakeholders list (`withClientPicker`): Company + Name only,
  // typed directly into the row (Notion-style) — every other field here is
  // "rest optional… fill in later via detail view" per issue #131, so it
  // isn't worth surfacing at all in the quick-add. CompanyDetail's own
  // sub-table (no `withClientPicker`) keeps the full stacked form — `clientId` is
  // implicit there, but the rest of these fields are genuinely meant to be
  // set at add-time for that flow.
  if (withClientPicker) {
    return (
      <InlineAddRow
        colSpan={colSpan}
        open={open}
        onOpenChange={onOpenChange}
        triggerDisabled={triggerDisabled}
        triggerLabel="Add a new stakeholder"
        isSaving={isSaving}
        onSave={() => onSave(values)}
        canSave={values.firstName !== '' && values.clientId !== ''}
        saveLabel="Add stakeholder"
        layout="inline"
      >
        <ClientCombobox
          value={values.clientId}
          onValueChange={(id) => set('clientId', id)}
          className="w-44"
        />
        <Input
          value={values.firstName}
          onChange={(e) => set('firstName', e.target.value)}
          placeholder="Name"
          className="w-40"
        />
      </InlineAddRow>
    );
  }

  return (
    <InlineAddRow
      colSpan={colSpan}
      open={open}
      onOpenChange={onOpenChange}
      triggerDisabled={triggerDisabled}
      triggerLabel="Add a new stakeholder"
      isSaving={isSaving}
      onSave={() => onSave(values)}
      canSave={values.firstName !== ''}
      saveLabel="Add stakeholder"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="First name" htmlFor="stakeholder-first-name" required>
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
            options={jobTitleSearch.options}
        onQueryChange={jobTitleSearch.onQueryChange}
        isFetching={jobTitleSearch.isFetching}
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
        label="City Coverage"
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
