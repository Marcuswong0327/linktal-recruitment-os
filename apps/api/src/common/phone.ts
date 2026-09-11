/**
 * AU / MY phone detection + standardization for Candidate/Stakeholder.mobile.
 * On save only — callers keep the original string when detection fails.
 */

/** Strip non-digits (matches VBA Step 1). */
export function digitsOnly(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '';
  return String(raw).replace(/\D/g, '');
}

/** Domestic MY mobiles: 010/012–014/016–019 + 7 digits (10 total). */
const MY_DOMESTIC_10 = /^01[0-46-9]\d{7}$/;
/** Longer MY mobiles: 011 / 015 + 8 digits (11 total). */
const MY_DOMESTIC_11 = /^01[15]\d{8}$/;
/** MY without leading 0 (Excel / typed). */
const MY_NSN_9 = /^1[0-46-9]\d{7}$/;
const MY_NSN_10 = /^1[15]\d{8}$/;

/** AU domestic: 02/03/04/07/08 + 8 digits. */
const AU_DOMESTIC_10 = /^0[23478]\d{8}$/;
/** AU without leading 0. */
const AU_NSN_9 = /^[23478]\d{8}$/;

/**
 * Infer country from digits-only input. Order: explicit CC → MY domestic → AU domestic.
 * Returns null when the shape is unrecognised (do not invent a CC).
 */
export function detectPhoneCountry(digits: string): '61' | '60' | null {
  if (!digits) return null;

  if (digits.startsWith('61') && /^61[23478]\d{8,}$/.test(digits)) return '61';
  if (digits.startsWith('60') && (/^601[0-46-9]\d{7,}$/.test(digits) || /^601[15]\d{8,}$/.test(digits))) {
    return '60';
  }

  if (MY_DOMESTIC_10.test(digits) || MY_DOMESTIC_11.test(digits)) return '60';
  if (MY_NSN_9.test(digits) || MY_NSN_10.test(digits)) return '60';

  if (AU_DOMESTIC_10.test(digits) || AU_NSN_9.test(digits)) return '61';

  // Broader international already-prefixed forms (after VBA double-zero cleanup paths).
  if (digits.startsWith('61') && digits.length >= 10) return '61';
  if (digits.startsWith('60') && digits.length >= 10) return '60';

  return null;
}

/**
 * VBA-style rewrite once country is known: leading 0, Excel-dropped NSN,
 * double-zero after CC, lone leading 0.
 */
function applyCountryRules(clean: string, cc: '61' | '60'): string {
  if (clean.startsWith('0') && (clean.length === 10 || clean.length === 11) && !clean.startsWith('00')) {
    return cc + clean.slice(1);
  }

  if (!clean.startsWith(cc)) {
    if (cc === '61' && clean.length === 9) return cc + clean;
    if (cc === '60' && (MY_NSN_9.test(clean) || MY_NSN_10.test(clean))) return cc + clean;
  }

  // e.g. 610424054143 → 61424054143 (cc + 0 + 9)
  if (clean.startsWith(`${cc}0`) && clean.length === cc.length + 1 + 9) {
    return cc + clean.slice(cc.length + 1);
  }
  // MY 011/015 domestic wrongly prefixed as 60011… (cc + 0 + 10)
  if (cc === '60' && clean.startsWith('600') && clean.length === 13) {
    return '60' + clean.slice(3);
  }

  if (clean.startsWith('0') && !clean.startsWith('00')) {
    return cc + clean.slice(1);
  }

  return clean;
}

/**
 * Standardize to `+61…` / `+60…` when AU/MY is detected.
 * Returns `null` when empty or unrecognised — caller must keep the original
 * (see `normalizeMobileForStorage`); null does **not** mean store empty.
 */
export function standardizePhone(raw: string | number | null | undefined): string | null {
  const clean0 = digitsOnly(raw);
  if (!clean0) return null;

  const cc = detectPhoneCountry(clean0);
  if (!cc) return null;

  const clean = applyCountryRules(clean0, cc);
  if (!clean.startsWith(cc)) return null;

  return `+${clean}`;
}

/** Display form with + prefix; already-`+` strings pass through after re-standardize attempt. */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const standardized = standardizePhone(phone);
  if (standardized) return standardized;
  const d = digitsOnly(phone);
  return d ? `+${d}` : phone.trim();
}

/**
 * Storage helper for create/update/import.
 * - `undefined` → leave field unset (partial update)
 * - blank → `null` (clear)
 * - detected AU/MY → `+61…` / `+60…`
 * - else → trimmed original (never emptied)
 */
export function normalizeMobileForStorage(
  raw: string | null | undefined,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return standardizePhone(trimmed) ?? trimmed;
}

export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const d = digitsOnly(phone);
  if (/^614\d{8}$/.test(d)) return true;
  if (/^61[2378]\d{8}$/.test(d)) return true;
  if (/^601[0-46-9]\d{7}$/.test(d)) return true;
  if (/^601[15]\d{8}$/.test(d)) return true;
  return false;
}
