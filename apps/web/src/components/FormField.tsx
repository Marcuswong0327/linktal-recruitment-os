import * as React from 'react';
import { Info } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Pairs a label with a form control. Stacked by default; `orientation="horizontal"` puts the label on the left and the control on the right — used by the read/edit info cards on detail pages. */
export function FormField({
  label,
  htmlFor,
  description,
  tooltip,
  required,
  error,
  orientation = 'vertical',
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
  /** 'vertical' (default): label above the control. 'horizontal': label to the left, control to the right. */
  orientation?: 'vertical' | 'horizontal';
  children: React.ReactNode;
}) {
  const labelNode = (
    <Label htmlFor={htmlFor} className="items-start">
      <span>
        {label}
        {required ? <span className="text-destructive">{' *'}</span> : null}
      </span>
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
  );

  const helperNode = error ? (
    <p className="text-xs text-destructive">{error}</p>
  ) : description ? (
    <p className="text-xs text-muted-foreground">{description}</p>
  ) : null;

  if (orientation === 'horizontal') {
    return (
      <div className="flex flex-row items-start gap-3">
        {label ? <div className="w-28 shrink-0 pt-1.5">{labelNode}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {children}
          {helperNode}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {labelNode}
      {children}
      {helperNode}
    </div>
  );
}
