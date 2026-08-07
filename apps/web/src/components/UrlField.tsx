'use client';

import { ExternalLink } from 'lucide-react';

import { Input } from '@/components/ui/input';

/** A URL `Input` plus an "open in new tab" affordance once a value is set. */
export function UrlField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        type="url"
        placeholder="https://…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open link in a new tab"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
