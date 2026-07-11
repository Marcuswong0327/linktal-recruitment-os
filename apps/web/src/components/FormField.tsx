import * as React from 'react';

import { Label } from '@/components/ui/label';

/** Pairs a label with a form control, stacked with consistent spacing. */
export function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
