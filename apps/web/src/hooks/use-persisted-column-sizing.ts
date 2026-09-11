'use client';

import * as React from 'react';
import type { ColumnSizingState } from '@tanstack/react-table';

const STORAGE_PREFIX = 'linktal.datagrid.column-sizing.';
const WRITE_DEBOUNCE_MS = 200;

function storageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

function read(id: string): ColumnSizingState {
  // Storage can throw outright (private window, blocked site data), not just
  // come back empty — same reasoning as use-recent-searches.
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next: ColumnSizingState = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function write(id: string, sizing: ColumnSizingState) {
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(sizing));
  } catch {
    // Full, or writes are blocked. In-memory sizing still works for this
    // session; it just won't survive a reload.
  }
}

/**
 * TanStack `columnSizing` state, optionally persisted in localStorage.
 *
 * Pass a stable `id` (e.g. `"job-orders"`) to restore widths across visits.
 * Omit / pass `undefined` for ephemeral session-only sizing.
 *
 * Read after mount (never during SSR render). Writes are debounced so
 * `columnResizeMode: 'onChange'` drags don't flood storage on every pixel.
 * The first write after a load is skipped so the empty initial state can't
 * clobber a previously saved map before hydrate finishes.
 */
export function usePersistedColumnSizing(id: string | undefined) {
  const [columnSizing, setColumnSizingState] = React.useState<ColumnSizingState>({});
  // Start true so the empty `{}` from the first client render is never
  // written; flipped true again after each load from storage.
  const skipNextWriteRef = React.useRef(true);

  React.useEffect(() => {
    if (!id) return;
    skipNextWriteRef.current = true;
    setColumnSizingState(read(id));
  }, [id]);

  React.useEffect(() => {
    if (!id) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    const timer = setTimeout(() => write(id, columnSizing), WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [id, columnSizing]);

  const setColumnSizing = React.useCallback(
    (updater: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizingState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    },
    [],
  );

  return [columnSizing, setColumnSizing] as const;
}
