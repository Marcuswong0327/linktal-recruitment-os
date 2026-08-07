'use client';

import * as React from 'react';
import { CornerDownLeft, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import {
  QUERY_LANGUAGE_FIELDS,
  getUsedFieldKeys,
  getValueSuggestions,
  resolveClauseForHighlight,
  type QueryLanguageLookups,
  type QueryLanguageValueOption,
  type ResolvedClause,
} from './parseQueryLanguage';

interface HighlightSegment {
  text: string;
  className?: string;
}

const VALUE_COLOR_CLASS: Record<NonNullable<ResolvedClause['valueColor']>, string> = {
  info: 'text-info',
  warning: 'text-warning',
  destructive: 'text-destructive',
  success: 'text-success',
  muted: 'text-muted-foreground',
  recognized: 'text-primary',
};

/**
 * Mirrors the raw text into colored spans for the backdrop layer — the key
 * part of a recognized clause is muted, the value part gets its semantic
 * color once it actually resolves to a real option (matches
 * `resolveClauseForHighlight`'s rules exactly). Splitting with a capturing
 * group keeps the separators themselves in the output, so joining every
 * segment's text back together reproduces the input verbatim — nothing
 * about spacing/casing is normalized away just to render it.
 */
function buildHighlightSegments(text: string, lookups: QueryLanguageLookups): HighlightSegment[] {
  const parts = text.split(/(,|\bAND\b)/gi);
  const segments: HighlightSegment[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      segments.push({ text: part }); // the separator itself
      return;
    }
    const resolved = resolveClauseForHighlight(part, lookups);
    if (!resolved) {
      segments.push({ text: part });
      return;
    }
    segments.push({ text: resolved.keyText, className: 'text-foreground/70 font-medium' });
    segments.push({
      text: resolved.valueText,
      className: resolved.valueColor ? `font-medium ${VALUE_COLOR_CLASS[resolved.valueColor]}` : undefined,
    });
  });
  return segments;
}

type Suggestion =
  | { kind: 'field'; label: string }
  | { kind: 'value'; label: string; variant?: QueryLanguageValueOption['variant'] };

/** Where the clause being typed at the caret starts, and how far into it the user's gotten. */
interface ActiveToken {
  mode: 'field' | 'value';
  /** Only set in value mode — the (lowercased) field key already typed before the colon. */
  fieldKey?: string;
  /** What's been typed so far for the part being completed. */
  draft: string;
  /** Index in the full string where a completion should start replacing from. */
  replaceStart: number;
}

/**
 * Finds the clause containing the caret (clauses are comma/"AND"-separated,
 * same split `parseQueryLanguage` uses) and splits it into "typing the field
 * name" or "typing the value" depending on whether a `:` has been typed yet
 * within that clause. Only text up to the caret is considered — trailing
 * text (if the caret isn't at the end) is left untouched by a completion.
 */
function getActiveToken(text: string, caret: number): ActiveToken {
  const before = text.slice(0, caret);
  const sepPattern = /,|\bAND\b/gi;
  let clauseStart = 0;
  let match: RegExpExecArray | null;
  while ((match = sepPattern.exec(before))) {
    clauseStart = match.index + match[0].length;
  }
  const rawClause = before.slice(clauseStart);
  const leadingWs = rawClause.match(/^\s*/)?.[0].length ?? 0;
  clauseStart += leadingWs;
  const clause = before.slice(clauseStart);

  const colonIndex = clause.indexOf(':');
  if (colonIndex === -1) {
    return { mode: 'field', draft: clause, replaceStart: clauseStart };
  }
  const fieldKey = clause.slice(0, colonIndex).trim().toLowerCase();
  const afterColon = clause.slice(colonIndex + 1);
  const valueLeadingWs = afterColon.match(/^\s*/)?.[0].length ?? 0;
  return {
    mode: 'value',
    fieldKey,
    draft: afterColon.slice(valueLeadingWs),
    replaceStart: clauseStart + colonIndex + 1 + valueLeadingWs,
  };
}

interface AdvancedSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter with no suggestion highlighted (or nothing left to complete) — run the search. */
  onSubmit: () => void;
  lookups: QueryLanguageLookups;
  placeholder?: string;
}

/**
 * A Supabase-style filter bar: typing a field name suggests the recognized
 * columns (Status, Industry, ...), and typing after `Field:` suggests that
 * field's real values (enum labels, or names from the already-loaded
 * catalogs) — Tab or click completes the highlighted one, Enter does the
 * same while a suggestion's live, or runs the search once there's nothing
 * left to complete.
 */
export function AdvancedSearchInput({
  value,
  onChange,
  onSubmit,
  lookups,
  placeholder,
}: AdvancedSearchInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const [caret, setCaret] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const token = React.useMemo(() => getActiveToken(value, caret), [value, caret]);
  const usedFieldKeys = React.useMemo(() => getUsedFieldKeys(value), [value]);
  const segments = React.useMemo(() => buildHighlightSegments(value, lookups), [value, lookups]);

  // The real input's text is fully transparent (see the className below) —
  // this backdrop is what the user actually sees. Kept pixel-aligned with
  // the input (same padding/font/height) and re-synced to its scrollLeft so
  // a query longer than the box still tracks the caret instead of just
  // clipping at a stale offset.
  React.useLayoutEffect(() => {
    if (inputRef.current && backdropRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  });
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    function sync() {
      if (backdropRef.current) backdropRef.current.scrollLeft = el!.scrollLeft;
    }
    el.addEventListener('scroll', sync);
    return () => el.removeEventListener('scroll', sync);
  }, []);

  const suggestions = React.useMemo<Suggestion[]>(() => {
    const draftLower = token.draft.trim().toLowerCase();
    if (token.mode === 'field') {
      return QUERY_LANGUAGE_FIELDS.filter(
        (f) =>
          !usedFieldKeys.has(f.key) &&
          (draftLower === '' || f.label.toLowerCase().startsWith(draftLower) || f.key.startsWith(draftLower)),
      ).map((f) => ({ kind: 'field' as const, label: f.label }));
    }
    const options = token.fieldKey ? getValueSuggestions(token.fieldKey, lookups) : null;
    if (!options) return [];
    return options
      .filter((o) => draftLower === '' || o.label.toLowerCase().startsWith(draftLower))
      .map((o) => ({ kind: 'value' as const, label: o.label, variant: o.variant }));
  }, [token, lookups, usedFieldKeys]);

  // A fresh keystroke always un-dismisses (Escape only suppresses until the
  // user acts again) and re-centers the highlight on the best match.
  React.useEffect(() => {
    setDismissed(false);
    setHighlightedIndex(0);
  }, [value]);

  const showDropdown = focused && !dismissed && suggestions.length > 0;

  function applySuggestion(suggestion: Suggestion) {
    const insertText = suggestion.kind === 'field' ? `${suggestion.label}: ` : `${suggestion.label}, `;
    const next = value.slice(0, token.replaceStart) + insertText + value.slice(caret);
    const nextCaret = token.replaceStart + insertText.length;
    onChange(next);
    setCaret(nextCaret);
    // Re-sync the actual DOM caret after the value commits — onChange's
    // setSelectionRange would otherwise run before React applies the new value.
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
      inputRef.current?.focus();
    });
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
      if (e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[highlightedIndex]);
        return;
      }
      // Enter only accepts a suggestion if the user actually typed something
      // toward it — otherwise (e.g. right after a value's trailing ", ",
      // browsing the full field list) Enter should submit, not pick blindly.
      if (e.key === 'Enter' && token.draft.trim() !== '') {
        e.preventDefault();
        applySuggestion(suggestions[highlightedIndex]);
        return;
      }
    }
    if (e.key === 'Enter') {
      onSubmit();
    }
  }

  function syncCaret(e: React.SyntheticEvent<HTMLInputElement>) {
    setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length);
  }

  return (
    <div className="relative flex-1">
      {/* Static fill — the real Input's own background is neutralized below so
          the colored backdrop text isn't tinted by a second, semi-transparent
          layer on top of it. */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-input/50" />
      {/* What the user actually sees: the real input's text is fully
          transparent (just a caret), and this mirrors it with per-token
          color. Pixel-aligned via identical padding/font/height. */}
      <div
        ref={backdropRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center overflow-hidden py-1 pl-8 pr-2.5 text-base whitespace-pre md:text-sm"
      >
        {segments.map((seg, i) => (
          <span key={i} className={seg.className}>
            {seg.text}
          </span>
        ))}
      </div>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={syncCaret}
        onKeyUp={syncCaret}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="bg-transparent pl-8 text-transparent caret-foreground"
      />
      {showDropdown ? (
        <div className="absolute top-full left-0 z-20 mt-1.5 max-h-72 w-max min-w-48 max-w-sm overflow-auto rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5">
          <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
            {token.mode === 'field'
              ? 'Fields'
              : `Values for ${QUERY_LANGUAGE_FIELDS.find((f) => f.key === token.fieldKey)?.label ?? token.fieldKey}`}
          </p>
          {suggestions.map((s, i) => (
            <button
              key={`${s.kind}:${s.label}`}
              type="button"
              // Keeps focus (and the caret position) on the input — a real
              // blur here would close the dropdown before onClick fires.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySuggestion(s)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors',
                i === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
              )}
            >
              {s.kind === 'value' && s.variant ? (
                <Badge variant={s.variant} className="rounded-sm px-1.5 font-normal">
                  {s.label}
                </Badge>
              ) : (
                <span>{s.label}</span>
              )}
              {i === highlightedIndex ? <Kbd>Tab</Kbd> : null}
            </button>
          ))}
          <div className="flex items-center gap-1.5 border-t border-border px-2 pt-1.5 pb-0.5 text-[11px] text-muted-foreground">
            <Kbd>
              <CornerDownLeft className="size-2.5" />
            </Kbd>
            or
            <Kbd>Tab</Kbd>
            to select
          </div>
        </div>
      ) : null}
    </div>
  );
}
