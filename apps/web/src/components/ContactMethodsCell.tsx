'use client';

import * as React from 'react';
import { Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

import { LinkedinIcon, SeekIcon } from '@/components/BrandIcons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function copyContactValue(value: string, label: string, onCopied: () => void) {
  navigator.clipboard.writeText(value).then(onCopied, () => toast.error(`Couldn't copy ${label.toLowerCase()}`));
}

/**
 * Email / Mobile icon: hover shows the value; click copies it. Empty values
 * stay visible but greyed-out so icon rows don't reflow.
 */
export function ContactCopyIcon({
  icon: Icon,
  value,
  label,
  size = 'md',
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: string | null;
  label: string;
  size?: 'sm' | 'md';
}) {
  const disabled = !value;
  // "Copied!" replaces the tooltip content for a beat instead of a toast —
  // the tooltip is already anchored to the button that was clicked.
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const copiedTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(copiedTimeout.current), []);

  function handleCopyClick() {
    if (!value) return;
    copyContactValue(value, label, () => {
      setCopied(true);
      clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopied(false), 1500);
    });
  }

  const isSm = size === 'sm';

  return (
    <Tooltip open={copied || tooltipOpen} onOpenChange={(next) => !copied && setTooltipOpen(next)}>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            data-no-row-drag
            onClick={handleCopyClick}
            aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Copy ${label.toLowerCase()}`}
            className={cn(
              'flex items-center justify-center rounded-md text-muted-foreground transition-colors',
              isSm ? 'size-6' : 'size-7',
              disabled ? 'cursor-not-allowed' : 'hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className={cn(isSm ? 'size-3.5' : 'size-4', disabled && 'opacity-30 grayscale')} />
          </button>
        }
      />
      <TooltipContent>
        {copied ? 'Copied!' : disabled ? `No ${label.toLowerCase()} on file` : value}
      </TooltipContent>
    </Tooltip>
  );
}

function ContactOpenIcon({
  icon: Icon,
  value,
  label,
  activeClassName = 'text-primary',
  size = 'md',
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: string | null;
  label: string;
  activeClassName?: string;
  size?: 'sm' | 'md';
}) {
  const disabled = !value;
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const isSm = size === 'sm';

  return (
    <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger
        render={
          <a
            href={value ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            data-no-row-drag
            aria-disabled={disabled}
            onClick={(e) => (disabled ? e.preventDefault() : e.stopPropagation())}
            aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Open ${label.toLowerCase()}`}
            className={cn(
              'flex items-center justify-center rounded-md transition-colors',
              isSm ? 'size-6' : 'size-7',
              disabled
                ? 'cursor-not-allowed text-muted-foreground'
                : cn(activeClassName, 'hover:bg-accent'),
            )}
          >
            <Icon className={cn(isSm ? 'size-3.5' : 'size-4', disabled && 'opacity-30 grayscale')} />
          </a>
        }
      />
      <TooltipContent>
        {disabled ? `No ${label.toLowerCase()} on file` : value ?? label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * One icon per contact method (Email/Mobile/LinkedIn, optionally Seek), for
 * entities that carry these as flat fields (Stakeholder, Candidate) — email
 * and mobile copy on click (tooltip shows the value); LinkedIn/Seek open.
 * Missing values stay greyed-out rather than hidden so the row doesn't shift.
 */
export function ContactMethodsCell({
  email,
  mobile,
  linkedinUrl,
  seekUrl,
  size = 'md',
}: {
  email?: string | null;
  mobile?: string | null;
  linkedinUrl?: string | null;
  /** Only rendered when the prop is passed at all — Stakeholder has no equivalent field, Candidate does (seekTalentUrl). */
  seekUrl?: string | null;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn('flex items-center gap-0.5', size === 'md' && 'justify-center gap-1')}
      onClick={(e) => e.stopPropagation()}
    >
      <ContactCopyIcon icon={Mail} value={email} label="Email" size={size} />
      <ContactCopyIcon icon={Phone} value={mobile} label="Mobile" size={size} />
      <ContactOpenIcon
        icon={LinkedinIcon}
        value={linkedinUrl}
        label="LinkedIn"
        activeClassName="text-[#0A66C2]"
        size={size}
      />
      {seekUrl !== undefined ? (
        <ContactOpenIcon icon={SeekIcon} value={seekUrl} label="Seek" size={size} />
      ) : null}
    </div>
  );
}
