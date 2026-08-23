'use client';

import type * as React from 'react';
import { ExternalLink } from 'lucide-react';

import { Input } from '@/components/ui/input';

/** A URL `Input` plus an "open in new tab" affordance once a value is set. */
export function UrlField({
  id,
  value,
  onChange,
  disabled,
  icon: Icon,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Leading icon identifying which link this is (e.g. brand mark for LinkedIn/Seek). */
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
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
