'use client';

import * as React from 'react';

const STORAGE_KEY = 'linktal.recent-searches';
const MAX_RECENTS = 6;

export type RecentEntityType = 'candidate' | 'company' | 'stakeholder';

export interface RecentSearch {
  type: RecentEntityType;
  id: string;
  /** What the palette showed as the result's title. */
  label: string;
  /** The muted second line — specialization/industry, or a stakeholder's company. */
  secondary?: string;
  href: string;
}

function read(): RecentSearch[] {
  // Storage can throw outright, not just come back empty: a private window, a
  // browser set to block site data, or an embedded webview will all reject the
  // access itself.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Written by an older build, or hand-edited — keep only well-formed rows
    // rather than letting a malformed one break the palette.
    return parsed.filter(
      (r): r is RecentSearch =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as RecentSearch).id === 'string' &&
        typeof (r as RecentSearch).label === 'string' &&
        typeof (r as RecentSearch).href === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * The last few records opened from the command palette, kept per browser.
 *
 * Deliberately the records themselves rather than the query strings that found
 * them: reopening "the candidate I was just looking at" is the thing worth one
 * keystroke, where replaying a search term only gets you back to a list you'd
 * have to pick from again.
 */
export function useRecentSearches() {
  const [recents, setRecents] = React.useState<RecentSearch[]>([]);

  // Read after mount, never during render: localStorage doesn't exist on the
  // server, and seeding state from it would make the first client render
  // disagree with the server's.
  React.useEffect(() => setRecents(read()), []);

  const remember = React.useCallback((entry: RecentSearch) => {
    setRecents((prev) => {
      // Re-opening something moves it to the front rather than duplicating it.
      const next = [entry, ...prev.filter((r) => !(r.type === entry.type && r.id === entry.id))].slice(
        0,
        MAX_RECENTS,
      );
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Full, or writes are blocked. The in-memory list still works for
        // this session; it just won't survive a reload.
      }
      return next;
    });
  }, []);

  const clear = React.useCallback(() => {
    setRecents([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do — the list is already cleared in memory.
    }
  }, []);

  return { recents, remember, clear };
}
