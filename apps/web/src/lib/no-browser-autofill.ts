/**
 * Props that stop the browser (especially Chrome) from injecting its own
 * history / address autofill over our typeaheads.
 *
 * Plain `autoComplete="off"` is ignored when Chrome decides a field looks like
 * a city or address — City Coverage typing "Sydney" is a classic trigger (the
 * black "Manage addresses…" popup). An unrecognized token defeats that
 * heuristic; the data-* flags cover 1Password / LastPass / Bitwarden.
 */
export const noBrowserAutofill = {
  // Non-standard on purpose — Chrome treats unknown tokens as "do not autofill".
  autoComplete: 'nope',
  autoCorrect: 'off',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;
