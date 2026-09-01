'use client';

import * as React from 'react';
import { Globe, X } from 'lucide-react';
import { toast } from 'sonner';

import { SeekIcon } from '@/components/BrandIcons';
import { GridCellInput } from '@/components/GridCellInput';

export interface JobResearchLinks {
  seekUrl: string;
  permanentUrl: string;
}

export type LinkKind = keyof JobResearchLinks;

// Bare domains people paste without a scheme ("careers.acme.com/job/123") are
// links too — required to have a dot and no whitespace so a stray word isn't
// filed as a URL.
const URL_LIKE = /^(https?:\/\/|www\.)/i;
const BARE_DOMAIN = /^[^\s/]+\.[a-z]{2,}(\/|$)/i;
// Matched against the host alone, not the whole string: an archive.org
// snapshot carries the original Seek URL in its *path*, and testing the raw
// string would file that under Seek instead of the archived copy it is.
// Loose on the suffix because the brand runs seek.com.au, seek.co.nz and more.
const SEEK_HOST = /(^|\.)seek\.[a-z]{2,}(\.[a-z]{2,})?$/i;

function hostOf(value: string): string {
  const withoutScheme = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return withoutScheme.split(/[/?#]/)[0].toLowerCase();
}

/**
 * Works out which of the two link fields a pasted URL belongs in.
 *
 * Only Seek is identified by host — it's the source the research workflow
 * actually names. Everything else that looks like a link is the permanent
 * one: an archive.org snapshot, a company careers page, a PDF. That's a
 * deliberate catch-all rather than a second host list, because "the archived
 * copy" has no fixed domain. Anything that isn't a link at all is reported
 * rather than guessed at.
 */
export function classifyLink(raw: string): LinkKind | null {
  const value = raw.trim();
  if (!value) return null;
  if (!URL_LIKE.test(value) && !BARE_DOMAIN.test(value)) return null;
  return SEEK_HOST.test(hostOf(value)) ? 'seekUrl' : 'permanentUrl';
}

const SLOTS: { key: LinkKind; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'seekUrl', label: 'Seek listing', Icon: SeekIcon },
  { key: 'permanentUrl', label: 'Permanent/archived link', Icon: Globe },
];

/**
 * One box that files a pasted job-ad link into Seek / permanent by itself.
 *
 * Same reasoning as `GridCellContactInput`, which does this for
 * email/phone/LinkedIn: the Links column holds two separate API fields, two
 * narrow inputs don't fit the column, and asking which one you meant is
 * redundant when the URL's own host already says. Paste, press Enter, and it
 * lands in the right slot as a chip.
 */
export function GridCellLinkInput({
  value,
  onChange,
  disabled,
}: {
  value: JobResearchLinks;
  onChange: (next: JobResearchLinks) => void;
  disabled?: boolean;
}) {
  const [pending, setPending] = React.useState('');

  function commitPending(): boolean {
    const raw = pending.trim();
    if (!raw) return false;
    const kind = classifyLink(raw);
    if (!kind) {
      toast.error(`"${raw}" doesn't look like a link`);
      return true; // handled — don't let it fall through and finish the row
    }
    onChange({ ...value, [kind]: raw });
    setPending('');
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (!pending.trim()) return; // nothing pending — let the row have it
      e.preventDefault();
      e.stopPropagation();
      commitPending();
      return;
    }
    if (e.key === 'Tab' && pending.trim()) commitPending();
  }

  return (
    <div className="flex flex-col gap-1 py-0.5">
      {SLOTS.filter((s) => value[s.key]).map(({ key, label, Icon }) => (
        <span
          key={key}
          className="flex items-center gap-1.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-xs"
        >
          <Icon className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{value[key]}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, [key]: '' })}
            aria-label={`Remove ${label}`}
            className="shrink-0 rounded-full text-muted-foreground opacity-60 outline-none hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <GridCellInput
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        onKeyDown={handleKeyDown}
        // Anything still in the box when focus leaves would otherwise be lost
        // on save — file it rather than silently dropping it.
        onBlur={() => {
          if (pending.trim() && classifyLink(pending)) commitPending();
        }}
        disabled={disabled}
        placeholder="Paste a link"
        aria-label="Seek or permanent link"
      />
    </div>
  );
}
