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

function ContactMethodButton({
  icon: Icon,
  value,
  label,
  activeClassName = 'text-primary',
  mode = 'copy',
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: string | null;
  label: string;
  /** Icon color when a value is on file — overridable for brand colors (e.g. LinkedIn blue). Disabled state ignores this and always renders greyed-out. */
  activeClassName?: string;
  /** 'copy' (default) puts the value on the clipboard — for Email/Mobile, which have no useful direct-interact target in a table row. 'open' navigates straight to `value` in a new tab instead — for LinkedIn/Seek, which are just URLs. */
  mode?: 'copy' | 'open';
}) {
  const disabled = !value;
  // "Copied!" replaces the tooltip's own content for a beat instead of a
  // toast — the tooltip is already anchored to the exact button that was
  // clicked, so it reads as feedback for that specific value with no extra
  // UI. `open` mirrors the tooltip's own hover state so the forced-open
  // "Copied!" state doesn't fight the pointer leaving before the timeout.
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

  const iconEl = (
    // grayscale+opacity (not just a text-color swap) so this dims
    // fixed-fill brand marks like SeekIcon the same way it dims the
    // currentColor icons
    <Icon className={cn('size-4', disabled && 'opacity-30 grayscale')} />
  );
  const className = cn(
    'flex size-7 items-center justify-center rounded-md transition-colors',
    disabled ? 'cursor-not-allowed text-muted-foreground' : cn(activeClassName, 'hover:bg-accent'),
  );

  return (
    <Tooltip open={copied || tooltipOpen} onOpenChange={(next) => !copied && setTooltipOpen(next)}>
      <TooltipTrigger
        render={
          mode === 'open' ? (
            <a
              href={value ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              data-no-row-drag
              aria-disabled={disabled}
              onClick={(e) => (disabled ? e.preventDefault() : e.stopPropagation())}
              aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Open ${label.toLowerCase()}`}
              className={className}
            >
              {iconEl}
            </a>
          ) : (
            <button
              type="button"
              disabled={disabled}
              data-no-row-drag
              onClick={handleCopyClick}
              aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Copy ${label.toLowerCase()}`}
              className={className}
            >
              {iconEl}
            </button>
          )
        }
      />
      <TooltipContent>
        {copied ? 'Copied!' : disabled ? `No ${label.toLowerCase()} on file` : mode === 'open' ? label : value}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * One icon per contact method (Email/Mobile/LinkedIn, optionally Seek), for
 * entities that carry these as flat fields (Stakeholder, Candidate) — click
 * copies the value. A method with no value on file renders greyed-out and
 * inert rather than being hidden, so the icon set's position doesn't shift
 * row to row.
 */
export function ContactMethodsCell({
  email,
  mobile,
  linkedinUrl,
  seekUrl,
}: {
  email?: string | null;
  mobile?: string | null;
  linkedinUrl?: string | null;
  /** Only rendered when the prop is passed at all — Stakeholder has no equivalent field, Candidate does (seekTalentUrl). */
  seekUrl?: string | null;
}) {
  return (
    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
      <ContactMethodButton icon={Mail} value={email} label="Email" />
      <ContactMethodButton icon={Phone} value={mobile} label="Mobile" />
      <ContactMethodButton
        icon={LinkedinIcon}
        value={linkedinUrl}
        label="LinkedIn"
        activeClassName="text-[#0A66C2]"
        mode="open"
      />
      {seekUrl !== undefined ? (
        <ContactMethodButton icon={SeekIcon} value={seekUrl} label="Seek" mode="open" />
      ) : null}
    </div>
  );
}
