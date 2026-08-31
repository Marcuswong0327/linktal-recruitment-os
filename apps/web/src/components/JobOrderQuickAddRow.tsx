'use client';

import * as React from 'react';

import { ClientCombobox } from '@/components/ClientCombobox';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { InlineAddRow } from '@/components/InlineAddRow';
import type { ClientEntity } from '@/lib/api/generated/types';

export interface JobOrderQuickAddValues {
  clientId: string;
  jobTitleId: string;
}

interface JobOrderQuickAddRowProps {
  colSpan: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerDisabled?: boolean;
  clients: ClientEntity[];
  jobTitles: CreatableComboboxOption[];
  onCreateJobTitle: (name: string) => Promise<CreatableComboboxOption>;
  isSaving: boolean;
  onSave: (values: JobOrderQuickAddValues) => void;
}

const emptyValues: JobOrderQuickAddValues = { clientId: '', jobTitleId: '' };

/**
 * Quick-add row for the Job Orders list (issue #131) — Client + Role are the
 * only fields critical enough to collect up front; everything else (openings,
 * compensation, description, consultants) is filled in later from the job
 * order's own detail page, which already supports editing all of it.
 * `layout="inline"` — type directly into the row, no form panel popping out
 * underneath it (Notion-style new-row feel).
 */
export function JobOrderQuickAddRow({
  colSpan,
  open,
  onOpenChange,
  triggerDisabled,
  clients,
  jobTitles,
  onCreateJobTitle,
  isSaving,
  onSave,
}: JobOrderQuickAddRowProps) {
  const [values, setValues] = React.useState(emptyValues);

  React.useEffect(() => {
    if (open) setValues(emptyValues);
  }, [open]);

  function set<K extends keyof JobOrderQuickAddValues>(key: K, value: JobOrderQuickAddValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <InlineAddRow
      colSpan={colSpan}
      open={open}
      onOpenChange={onOpenChange}
      triggerDisabled={triggerDisabled}
      triggerLabel="Add a new job order"
      isSaving={isSaving}
      onSave={() => onSave(values)}
      canSave={values.clientId !== '' && values.jobTitleId !== ''}
      saveLabel="Add job order"
      layout="inline"
    >
      <ClientCombobox
        value={values.clientId}
        onValueChange={(id) => set('clientId', id)}
        clients={clients}
        className="w-44"
      />
      <CreatableCombobox
        value={values.jobTitleId}
        onValueChange={(id) => set('jobTitleId', id)}
        options={jobTitles}
        onCreate={onCreateJobTitle}
        placeholder="Role"
        className="w-44"
      />
    </InlineAddRow>
  );
}
