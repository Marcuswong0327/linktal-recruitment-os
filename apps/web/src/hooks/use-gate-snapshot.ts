'use client';

import * as React from 'react';

/**
 * Session-scoped "the view you were looking at" snapshot for a search-gated
 * page (Companies, Job Opening Search) — the draft selections in the action
 * bar, the committed applied filters that actually drive the table, and the
 * id→name caches the chips render from (those names only ever arrive
 * alongside a live search result, so without them a restored chip would show
 * a raw id).
 *
 * Two calls rather than one because the snapshot is needed at both ends of
 * the component: read *before* the `useState` initialisers it seeds, written
 * *after* the state it captures exists.
 */

/**
 * Reads the snapshot once, at mount, and only when `restoring` — an explicit
 * `?restore=1` return from a workspace the user stepped into. Arriving at the
 * page normally still gives the usual scope-seeded start, so a stale snapshot
 * from earlier in the session never silently overrides it.
 *
 * Callers seed their `useState` initialisers from the result and pass
 * `skip: snapshot !== null` to `useSeedFiltersFromScope`, so scope seeding
 * doesn't overwrite what was just restored.
 */
export function useGateSnapshot<T>(key: string, restoring: boolean): T | null {
  // Captured in a state initialiser so it's read before the first persist
  // effect replaces it, and stays stable for the life of the page.
  const [snapshot] = React.useState<T | null>(() => {
    if (!restoring) return null;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      // Private mode, no `window` yet, or a shape that no longer parses —
      // fall back to the page's normal defaults.
      return null;
    }
  });

  return snapshot;
}

/**
 * Keeps the stored snapshot current, rather than writing it at the moment the
 * user leaves: the button that navigates away lives several components down
 * the tree, and this way any future exit-and-return gets the same treatment
 * for free.
 */
export function usePersistGateSnapshot<T>(key: string, value: T): void {
  // Serialized during render so the effect is gated on the content changing,
  // not on `value`'s identity — callers pass a fresh object literal every
  // render.
  let serialized: string | null;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = null;
  }

  React.useEffect(() => {
    if (serialized === null) return;
    try {
      window.sessionStorage.setItem(key, serialized);
    } catch {
      // Private mode or a full quota — losing the restore is not worth
      // breaking the page over.
    }
  }, [key, serialized]);
}
