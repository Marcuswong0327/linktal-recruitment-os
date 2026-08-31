import * as React from 'react';
import { Info } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** The dot half of FormField's `changeState` indicator, standalone for labels that aren't a FormField — a Card title or a table column header, say. Same amber-dirty/green-saved meaning as FormField's own. */
export function ChangeDot({ state }: { state?: 'dirty' | 'saved' }) {
  if (!state) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        state === 'dirty' ? 'bg-warning' : 'bg-success',
      )}
    />
  );
}

/** Pairs a label with a form control. Stacked by default; `orientation="horizontal"` puts the label on the left and the control on the right — used by the read/edit info cards on detail pages. */
export function FormField({
  label,
  htmlFor,
  description,
  tooltip,
  required,
  error,
  orientation = 'vertical',
  changeState,
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
  /** Marks the field as changed-but-unsaved ('dirty', amber) or just-saved ('saved', a brief green confirmation flash) — a colored left-edge bar plus a matching dot next to the label. Omit for no indicator. The bar's gutter is always reserved (transparent when unset) so a field never shifts when this toggles on/off. */
  changeState?: 'dirty' | 'saved';
  children: React.ReactNode;
}) {
  const labelNode = (
    <Label htmlFor={htmlFor} className="items-start">
      <span className="flex items-center gap-1.5">
        <ChangeDot state={changeState} />
        {label}
        {required ? <span className="text-destructive">{' *'}</span> : null}
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

  const changeBarClass = cn(
    'border-l-2 pl-2.5 -ml-2.5 transition-colors duration-300',
    changeState === 'dirty'
      ? 'border-warning'
      : changeState === 'saved'
        ? 'border-success'
        : 'border-transparent',
  );

  if (orientation === 'horizontal') {
    return (
      <div className={cn('flex flex-row items-start gap-3', changeBarClass)}>
        {label ? <div className="w-28 shrink-0 pt-1.5">{labelNode}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {children}
          {helperNode}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5', changeBarClass)}>
      {labelNode}
      {children}
      {helperNode}
    </div>
  );
}
