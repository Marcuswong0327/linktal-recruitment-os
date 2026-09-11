import {
  detectPhoneCountry,
  digitsOnly,
  isValidPhone,
  normalizeMobileForStorage,
  standardizePhone,
} from './phone';

describe('digitsOnly', () => {
  it('strips non-digits', () => {
    expect(digitsOnly('+61 424 054 143')).toBe('61424054143');
    expect(digitsOnly('012-345 6789')).toBe('0123456789');
  });

  it('returns empty for nullish/blank', () => {
    expect(digitsOnly(null)).toBe('');
    expect(digitsOnly(undefined)).toBe('');
    expect(digitsOnly('')).toBe('');
  });
});

describe('detectPhoneCountry', () => {
  it('detects AU mobile and landline shapes', () => {
    expect(detectPhoneCountry('0424054143')).toBe('61');
    expect(detectPhoneCountry('424054143')).toBe('61');
    expect(detectPhoneCountry('61424054143')).toBe('61');
    expect(detectPhoneCountry('0295501234')).toBe('61');
    expect(detectPhoneCountry('61295501234')).toBe('61');
    expect(detectPhoneCountry('0395501234')).toBe('61');
  });

  it('detects MY mobile shapes', () => {
    expect(detectPhoneCountry('0123456789')).toBe('60');
    expect(detectPhoneCountry('0161234567')).toBe('60');
    expect(detectPhoneCountry('60123456789')).toBe('60');
    expect(detectPhoneCountry('01123456789')).toBe('60');
    expect(detectPhoneCountry('123456789')).toBe('60'); // dropped leading 0 from 012…
  });

  it('returns null for unrecognised', () => {
    expect(detectPhoneCountry('12345')).toBeNull();
    expect(detectPhoneCountry('441234567890')).toBeNull();
  });
});

describe('standardizePhone', () => {
  it('standardizes AU mobiles to +61…', () => {
    expect(standardizePhone('0424054143')).toBe('+61424054143');
    expect(standardizePhone('424054143')).toBe('+61424054143');
    expect(standardizePhone('+61 424 054 143')).toBe('+61424054143');
    expect(standardizePhone('610424054143')).toBe('+61424054143');
  });

  it('standardizes AU landlines to +612 / +613 / +617 / +618', () => {
    expect(standardizePhone('02 9550 1234')).toBe('+61295501234');
    expect(standardizePhone('+61 2 9550 1234')).toBe('+61295501234');
    expect(standardizePhone('0395501234')).toBe('+61395501234');
    expect(standardizePhone('0795501234')).toBe('+61795501234');
    expect(standardizePhone('0895501234')).toBe('+61895501234');
    expect(standardizePhone('295501234')).toBe('+61295501234');
  });

  it('standardizes MY mobiles to +60…', () => {
    expect(standardizePhone('012-345 6789')).toBe('+60123456789');
    expect(standardizePhone('0161234567')).toBe('+60161234567');
    expect(standardizePhone('+60 16 123 4567')).toBe('+60161234567');
    expect(standardizePhone('+6012-345 6789')).toBe('+60123456789');
  });

  it('returns null for empty or unrecognised (caller keeps original)', () => {
    expect(standardizePhone('')).toBeNull();
    expect(standardizePhone(null)).toBeNull();
    expect(standardizePhone('12345')).toBeNull();
    expect(standardizePhone('ext 42')).toBeNull();
  });
});

describe('normalizeMobileForStorage', () => {
  it('clears blank to null', () => {
    expect(normalizeMobileForStorage('')).toBeNull();
    expect(normalizeMobileForStorage('   ')).toBeNull();
  });

  it('passes through undefined', () => {
    expect(normalizeMobileForStorage(undefined)).toBeUndefined();
  });

  it('stores standardized when detected', () => {
    expect(normalizeMobileForStorage('0424054143')).toBe('+61424054143');
    expect(normalizeMobileForStorage('0123456789')).toBe('+60123456789');
  });

  it('keeps unrecognised trimmed original', () => {
    expect(normalizeMobileForStorage('  ext 42  ')).toBe('ext 42');
    expect(normalizeMobileForStorage('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});

describe('isValidPhone', () => {
  it('accepts AU mobile and landline international forms', () => {
    expect(isValidPhone('+61424054143')).toBe(true);
    expect(isValidPhone('61424054143')).toBe(true);
    expect(isValidPhone('+61295501234')).toBe(true);
  });

  it('accepts MY mobiles', () => {
    expect(isValidPhone('+60123456789')).toBe(true);
    expect(isValidPhone('+601123456789')).toBe(true);
  });

  it('rejects empty', () => {
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});
