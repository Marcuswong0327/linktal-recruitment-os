'use client';

import * as React from 'react';
import { CornerDownLeft, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import type { CandidateFilterState } from './useCandidateSearch';

interface NamedOption {
  id: string;
  name: string;
}

export interface CandidateSearchLookups {
  jobRoleTypes: NamedOption[];
  industries: NamedOption[];
  consultants: NamedOption[];
}

// Specialization is deliberately not a suggestion source here — it's 775+
// rows and growing, server-searched on demand by CatalogMultiSelectFilter
// (see its doc), and offering it as a search-bar suggestion would mean
// preloading the whole catalog just for that, undoing the point.
type SuggestionField = 'jobRoleTypeIds' | 'industryIds' | 'consultantIds';

const FIELD_LABELS: Record<SuggestionField, string> = {
  jobRoleTypeIds: 'Role Type',
  industryIds: 'Industry',
  consultantIds: 'Consultant',
};

interface Suggestion {
  field: SuggestionField;
  option: NamedOption;
}

/**
 * A single search box, replacing the old free-text/"Advanced (Key-Value
 * Search)" tab split. There's no syntax to learn: typing a name that matches
 * a real catalog entry (a Role Type, Industry, Specialization or Consultant)
 * offers it as a one-click filter chip; anything else just runs as free text
 * on Enter — same fields the API's `q` already covers (name, email, mobile,
 * displayId, current role/company, resolved location/industry/role type).
 *
 * Deliberately does not attempt to recognize a typed `Key: Value` clause —
 * that was the old query language. Consultants pick from real values; they
 * don't memorize field names or syntax (see .impeccable.md principle #3).
 */
export function CandidateSearchBar({
  value,
  onChange,
  onSubmit,
  onApplyFilter,
  lookups,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Enter with no suggestion highlighted — runs the typed text as free-text search (replacing, not appending to, whatever's already there). */
  onSubmit: () => void;
  /** A suggestion was picked — merge it into the filter state and clear the input. */
  onApplyFilter: (patch: Partial<CandidateFilterState>) => void;
  lookups: CandidateSearchLookups;
  placeholder?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const suggestions = React.useMemo<Suggestion[]>(() => {
    const needle = value.trim().toLowerCase();
    if (needle.length < 2) return [];
    const fields: [SuggestionField, NamedOption[]][] = [
      ['jobRoleTypeIds', lookups.jobRoleTypes],
      ['industryIds', lookups.industries],
      ['consultantIds', lookups.consultants],
    ];
    const matches: Suggestion[] = [];
    for (const [field, options] of fields) {
      for (const option of options) {
        if (option.name.toLowerCase().startsWith(needle)) matches.push({ field, option });
        if (matches.length >= 6) break;
      }
      if (matches.length >= 6) break;
    }
    return matches;
  }, [value, lookups]);

  React.useEffect(() => {
    setDismissed(false);
    setHighlightedIndex(0);
  }, [value]);

  const showDropdown = focused && !dismissed && suggestions.length > 0;

  function applySuggestion(suggestion: Suggestion) {
    onApplyFilter({ [suggestion.field]: [suggestion.option.id] } as Partial<CandidateFilterState>);
    onChange('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        applySuggestion(suggestions[highlightedIndex]);
        return;
      }
    }
    if (e.key === 'Enter') onSubmit();
  }

  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Search by name, email, phone, current title, company…'}
        className="pl-8"
      />
      {showDropdown ? (
        <div className="absolute top-full left-0 z-20 mt-1.5 max-h-72 w-max min-w-56 max-w-sm overflow-auto rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5">
          <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Add as a filter</p>
          {suggestions.map((s, i) => (
            <button
              key={`${s.field}:${s.option.id}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySuggestion(s)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors',
                i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
              )}
            >
              <span className="truncate">
                <span className="text-muted-foreground">{FIELD_LABELS[s.field]}: </span>
                {s.option.name}
              </span>
              {i === highlightedIndex ? <Kbd>Tab</Kbd> : null}
            </button>
          ))}
          <div className="flex items-center gap-1.5 border-t border-border px-2 pt-1.5 pb-0.5 text-[11px] text-muted-foreground">
            <Kbd>
              <CornerDownLeft className="size-2.5" />
            </Kbd>
            or
            <Kbd>Tab</Kbd>
            to add
          </div>
        </div>
      ) : null}
    </div>
  );
}
