import * as React from 'react';

/**
 * Cmd+Enter (Mac) / Ctrl+Enter (Windows/Linux) triggers `onSave`, regardless
 * of which field on the page currently has focus. Deliberately not plain
 * Enter — a detail page's fields include comboboxes/dropdowns where Enter
 * already means "confirm this selection", so binding save to plain Enter too
 * made the two conflict (confirming a dropdown pick could also submit the
 * whole form). Same modifier convention as CandidateDetail's note-submit
 * shortcut.
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const onSaveRef = React.useRef(onSave);
  onSaveRef.current = onSave;

  React.useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      onSaveRef.current();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

/**
 * Pair with `useSaveShortcut` on the form's own `onKeyDown` — blocks the
 * browser's native implicit-submit-on-Enter for a plain `<input>` (it fires
 * regardless of any JS, since the Save button is associated via `form=`
 * rather than DOM nesting), so Cmd/Ctrl+Enter stays the *only* way this form
 * submits instead of two inconsistent paths. Leaves `<textarea>` alone —
 * Enter there inserts a newline, not a submit, so there's nothing to block.
 */
export function blockImplicitEnterSubmit(e: React.KeyboardEvent) {
  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && e.target instanceof HTMLInputElement) {
    e.preventDefault();
  }
}
