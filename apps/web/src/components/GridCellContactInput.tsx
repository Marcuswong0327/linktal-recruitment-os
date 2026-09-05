'use client';

import * as React from 'react';
import { Mail, Phone, X } from 'lucide-react';

import { LinkedinIcon, SeekIcon } from '@/components/BrandIcons';
import { toast } from 'sonner';

import { GridCellInput } from '@/components/GridCellInput';

export interface ContactValues {
  email: string;
  mobile: string;
  linkedinUrl: string;
  /** Candidates only — Stakeholder has no Seek equivalent. */
  seekTalentUrl: string;
}

export const emptyContact: ContactValues = {
  email: '',
  mobile: '',
  linkedinUrl: '',
  seekTalentUrl: '',
};

export type ContactKind = keyof ContactValues;

/** The three every record has. Candidates add `seekTalentUrl`. */
export const DEFAULT_CONTACT_SLOTS: ContactKind[] = ['email', 'mobile', 'linkedinUrl'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LINKEDIN = /linkedin\.com/i;
// Checked before the generic URL rule below, which would otherwise sweep a
// Seek profile link into linkedinUrl.
const SEEK = /seek\.com/i;
const URL_LIKE = /^(https?:\/\/|www\.)/i;
// Phone punctuation people actually paste: +61 (04) 1234-5678, 0412 345 678.
const PHONE_PUNCTUATION = /[\s()+.-]/g;

/**
 * Works out which of the three contact fields a typed value belongs in.
 *
 * Order matters: the checks run most- to least-specific. An email is the only
 * form with an `@`, a LinkedIn URL is the only one naming that host, and a
 * phone number is whatever is left once the punctuation people pad numbers
 * with is stripped. Anything else is reported as unrecognised rather than
 * guessed at — silently filing a typo'd email under "mobile" is worse than
 * saying it didn't parse.
 */
export function classifyContact(raw: string): ContactKind | null {
  const value = raw.trim();
  if (!value) return null;
  if (EMAIL.test(value)) return 'email';
  if (SEEK.test(value)) return 'seekTalentUrl';
  if (LINKEDIN.test(value) || URL_LIKE.test(value)) return 'linkedinUrl';
  const digits = value.replace(PHONE_PUNCTUATION, '');
  // 6 digits is the shortest real landline here; below that it's more likely
  // a stray fragment than a number.
  if (/^\d{6,}$/.test(digits)) return 'mobile';
  return null;
}

const SLOTS: { key: ContactKind; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'mobile', label: 'Phone', Icon: Phone },
  // House brand marks, the same ones ContactMethodsCell uses for this column.
  { key: 'linkedinUrl', label: 'LinkedIn', Icon: LinkedinIcon },
  { key: 'seekTalentUrl', label: 'Seek', Icon: SeekIcon },
];

interface GridCellContactInputProps {
  value: ContactValues;
  onChange: (next: ContactValues) => void;
  /** Which fields this record actually has. Defaults to the common three. */
  slots?: ContactKind[];
  disabled?: boolean;
}

/**
 * One box that files what you type into email / phone / LinkedIn by itself.
 *
 * The Contact column holds three separate API fields (`email`, `mobile`,
 * `linkedinUrl`), but three narrow inputs don't fit its width and asking which
 * one you meant is redundant — the value's own shape already says. So there's
 * a single box: type or paste, press Enter, and it lands in the right slot as
 * a chip. Enter with a pending value is consumed here rather than finishing
 * the row, the same way an open suggestion list keeps that keystroke; once the
 * box is empty, Enter reaches the row again.
 */
export function GridCellContactInput({
  value,
  onChange,
  slots = DEFAULT_CONTACT_SLOTS,
  disabled,
}: GridCellContactInputProps) {
  const [pending, setPending] = React.useState('');

  function commitPending(): boolean {
    const raw = pending.trim();
    if (!raw) return false;
    const kind = classifyContact(raw);
    // A kind this record doesn't have (a Seek link on a stakeholder) is
    // reported, not quietly filed under the nearest slot that does exist.
    if (!kind || !slots.includes(kind)) {
      toast.error(`"${raw}" isn't a recognisable email, phone number or LinkedIn URL`);
      return true; // handled — don't let it fall through and finish the row
    }
    onChange({ ...value, [kind]: raw });
    setPending('');
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Comma/Tab file the value too, so several can be pasted in one pass
    // without reaching for Enter each time. Tab still moves on afterwards.
    if (e.key === 'Enter' || e.key === ',') {
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
      {SLOTS.filter((s) => slots.includes(s.key) && value[s.key]).map(({ key, label, Icon }) => (
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
          const kind = classifyContact(pending);
          if (pending.trim() && kind && slots.includes(kind)) commitPending();
        }}
        disabled={disabled}
        aria-label="Email, phone or LinkedIn"
        placeholder="Email, phone or LinkedIn"
      />
    </div>
  );
}
