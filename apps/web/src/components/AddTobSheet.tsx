'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import { FormField } from '@/components/FormField';
import { UrlField } from '@/components/UrlField';
import type { ConsultantEntity } from '@/lib/api/generated/types';

export interface AddTobValues {
  fileName: string | null;
  fileType: string | null;
  sourceFileLink: string | null;
  clientTobRepresentative: string | null;
  linktalRepresentativeId: string | null;
  pricing: string | null;
  guaranteePeriod: number | null;
  paymentTerm: string | null;
  invoiceContactName: string | null;
  invoiceContactEmail: string | null;
}

interface AddTobSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Company this TOB is filed against — shown in the sheet description. */
  companyName: string;
  consultants: ConsultantEntity[];
  isSaving: boolean;
  onSave: (values: AddTobValues) => void;
}

const emptyValues = {
  fileName: '',
  fileType: '',
  sourceFileLink: '',
  clientTobRepresentative: '',
  linktalRepresentativeId: '',
  pricing: '',
  guaranteePeriod: '',
  paymentTerm: '',
  invoiceContactName: '',
  invoiceContactEmail: '',
};

/** File a new Terms of Business against a client — from the company detail page's TOB card. */
export function AddTobSheet({ open, onOpenChange, companyName, consultants, isSaving, onSave }: AddTobSheetProps) {
  const [values, setValues] = React.useState(emptyValues);

  // Reset every time the sheet opens, not just on first mount.
  React.useEffect(() => {
    if (open) setValues(emptyValues);
  }, [open]);

  function set<K extends keyof typeof emptyValues>(key: K, value: (typeof emptyValues)[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      fileName: values.fileName.trim() || null,
      fileType: values.fileType.trim() || null,
      sourceFileLink: values.sourceFileLink.trim() || null,
      clientTobRepresentative: values.clientTobRepresentative.trim() || null,
      linktalRepresentativeId: values.linktalRepresentativeId || null,
      pricing: values.pricing.trim() || null,
      guaranteePeriod: values.guaranteePeriod.trim() ? Number(values.guaranteePeriod) : null,
      paymentTerm: values.paymentTerm.trim() || null,
      invoiceContactName: values.invoiceContactName.trim() || null,
      invoiceContactEmail: values.invoiceContactEmail.trim() || null,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Add a Terms of Business</SheetTitle>
            <SheetDescription>File a new TOB against {companyName}.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
            <FormField label="Pricing" htmlFor="tob-pricing" description="Free text — e.g. &quot;15%&quot; or a tiered schedule.">
              <Input
                id="tob-pricing"
                value={values.pricing}
                onChange={(e) => set('pricing', e.target.value)}
              />
            </FormField>
            <FormField label="Guarantee period" htmlFor="tob-guarantee" description="In days.">
              <Input
                id="tob-guarantee"
                type="number"
                min={0}
                max={3650}
                value={values.guaranteePeriod}
                onChange={(e) => set('guaranteePeriod', e.target.value)}
              />
            </FormField>
            <FormField label="Payment terms" htmlFor="tob-payment-term">
              <Input
                id="tob-payment-term"
                value={values.paymentTerm}
                onChange={(e) => set('paymentTerm', e.target.value)}
              />
            </FormField>
            <FormField label="Client representative" htmlFor="tob-client-rep" description="Who signed/agreed on the client's side.">
              <Input
                id="tob-client-rep"
                value={values.clientTobRepresentative}
                onChange={(e) => set('clientTobRepresentative', e.target.value)}
              />
            </FormField>
            <FormField label="Linktal representative" htmlFor="tob-linktal-rep">
              <ConsultantCombobox
                id="tob-linktal-rep"
                value={values.linktalRepresentativeId}
                onValueChange={(id) => set('linktalRepresentativeId', id)}
                consultants={consultants}
              />
            </FormField>
            <FormField label="Invoice contact name" htmlFor="tob-invoice-name">
              <Input
                id="tob-invoice-name"
                value={values.invoiceContactName}
                onChange={(e) => set('invoiceContactName', e.target.value)}
              />
            </FormField>
            <FormField label="Invoice contact email" htmlFor="tob-invoice-email">
              <Input
                id="tob-invoice-email"
                type="email"
                value={values.invoiceContactEmail}
                onChange={(e) => set('invoiceContactEmail', e.target.value)}
              />
            </FormField>
            <FormField label="Source file link" htmlFor="tob-source-link" description="e.g. a SharePoint URL — this is what the TOB ID links to.">
              <UrlField
                id="tob-source-link"
                value={values.sourceFileLink}
                onChange={(v) => set('sourceFileLink', v)}
                icon={FileText}
              />
            </FormField>
            <FormField label="File name" htmlFor="tob-file-name">
              <Input id="tob-file-name" value={values.fileName} onChange={(e) => set('fileName', e.target.value)} />
            </FormField>
            <FormField label="File type" htmlFor="tob-file-type" description='e.g. "TOB Document", "Email Communication".'>
              <Input id="tob-file-type" value={values.fileType} onChange={(e) => set('fileType', e.target.value)} />
            </FormField>
          </div>

          <SheetFooter className="flex-row justify-end">
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Add TOB'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
