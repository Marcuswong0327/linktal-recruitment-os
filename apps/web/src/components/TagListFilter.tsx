'use client';

import * as React from 'react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface TagListFilterProps {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

/**
 * A free-entry, multi-value filter — type a value and press Enter/comma to
 * add it as a chip, repeat for as many as needed. For filter fields with no
 * fixed catalog to pick from (e.g. Skills), unlike DataGridFacetedFilter
 * which needs a fixed `options` list.
 */
export function TagListFilter({ title, values, onChange, placeholder }: TagListFilterProps) {
  const [draft, setDraft] = React.useState('');
  const active = values.length > 0;

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft('');
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              active && 'border-solid',
            )}
          />
        }
      >
        {title}
        {active ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            {values.length <= 2 ? (
              values.map((v) => (
                <Badge key={v} variant="default" className="rounded-sm px-1 font-normal">
                  {v}
                </Badge>
              ))
            ) : (
              <Badge variant="muted" className="rounded-sm px-1 font-normal">
                {values.length} selected
              </Badge>
            )}
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-3">
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => {
              // Comma-separated paste/typing adds each segment as its own tag.
              const parts = e.target.value.split(',');
              if (parts.length > 1) {
                const additions = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean);
                onChange(Array.from(new Set([...values, ...additions])));
                setDraft(parts[parts.length - 1]);
              } else {
                setDraft(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            placeholder={placeholder ?? 'Type and press Enter…'}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          {values.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {values.map((v) => (
                <Badge key={v} variant="secondary" className="gap-1">
                  {v}
                  <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(v)}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
