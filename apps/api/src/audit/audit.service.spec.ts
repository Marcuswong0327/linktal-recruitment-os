import { isGroupableRequestId } from './audit.service';

describe('isGroupableRequestId', () => {
  it('accepts a real per-request uuid', () => {
    expect(isGroupableRequestId('dce87a60-258a-4c21-9bd9-9e719dc2f7f9')).toBe(true);
  });

  it('rejects the e2e suite\'s fixed placeholder', () => {
    // Every row any test run has ever written shares this literal string, so
    // grouping on it would merge unrelated actions into one enormous
    // fictitious "action" — and the sheet would offer to show all of it.
    expect(isGroupableRequestId('e2e-test')).toBe(false);
  });

  it('rejects a missing or empty id rather than grouping every such row together', () => {
    expect(isGroupableRequestId(undefined)).toBe(false);
    expect(isGroupableRequestId('')).toBe(false);
  });
});
