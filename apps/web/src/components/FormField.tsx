import * as React from 'react';
import { Info } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Pairs a label with a form control, stacked with consistent spacing. */
export function FormField({
  label,
  htmlFor,
  description,
  tooltip,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Muted helper text under the control — explains what to enter, not what the field already says. */
  description?: string;
  /** Same explanation, but tucked behind a hover-triggered info icon next to the label instead of always-visible text — use for detail that's nice-to-have, not something every user needs every time. */
  tooltip?: React.ReactNode;
  /** Shows a red asterisk next to the label. */
  required?: boolean;
  /** Overrides `description` with a destructive-styled validation message. */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="size-3.5" />
                </button>
              }
            />
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
