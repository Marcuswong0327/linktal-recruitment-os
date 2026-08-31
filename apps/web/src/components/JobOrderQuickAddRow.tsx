'use client';

import * as React from 'react';

import { ClientCombobox } from '@/components/ClientCombobox';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { FormField } from '@/components/FormField';
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
 * order's own detail page, which already supports editing all of it. Passed
 * to DataGrid's `trailingRow` so it renders as the actual last row in the
 * table body, right before "-- END OF LIST --" — not a separate element
 * below the grid.
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
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Client" htmlFor="quick-add-job-order-client" required>
          <ClientCombobox
            id="quick-add-job-order-client"
            value={values.clientId}
            onValueChange={(id) => set('clientId', id)}
            clients={clients}
          />
        </FormField>
        <FormField
          label="Role"
          htmlFor="quick-add-job-order-role"
          description="The client's own words for the role."
          required
        >
          <CreatableCombobox
            id="quick-add-job-order-role"
            value={values.jobTitleId}
            onValueChange={(id) => set('jobTitleId', id)}
            options={jobTitles}
            onCreate={onCreateJobTitle}
            placeholder="e.g. Production Manager"
          />
        </FormField>
      </div>
    </InlineAddRow>
  );
}
