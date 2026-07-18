import { computeChanges, deriveAction, toJson } from './prisma.extensions';

describe('toJson', () => {
  it('passes primitives through and nulls undefined/null', () => {
    expect(toJson('x')).toBe('x');
    expect(toJson(5)).toBe(5);
    expect(toJson(false)).toBe(false);
    expect(toJson(null)).toBeNull();
    expect(toJson(undefined)).toBeNull();
  });

  it('serialises Date to ISO and bigint/Decimal to string', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(toJson(d)).toBe('2026-01-02T03:04:05.000Z');
    expect(toJson(10n)).toBe('10');
    // Fake a Prisma Decimal (matched by constructor name).
    class Decimal {
      constructor(private v: string) {}
      toString() {
        return this.v;
      }
    }
    expect(toJson(new Decimal('12.50'))).toBe('12.50');
  });
});

describe('computeChanges', () => {
  it('records only changed scalar fields as {from,to}', () => {
    const before = { status: 'COLD', fullName: 'Jane', city: 'Perth' };
    const changes = computeChanges(before, { status: 'WARM', city: 'Perth' });
    expect(changes).toEqual({ status: { from: 'COLD', to: 'WARM' } });
  });

  it('unwraps atomic { set } forms and skips relation ops', () => {
    const before = { status: 'COLD' };
    const changes = computeChanges(before, {
      status: { set: 'HOT' },
      submissions: { create: [{ jobOrderId: 'j1' }] }, // nested relation → skipped
    });
    expect(changes).toEqual({ status: { from: 'COLD', to: 'HOT' } });
  });

  it('treats a missing before-image as from: null', () => {
    expect(computeChanges(null, { fullName: 'New' })).toEqual({
      fullName: { from: null, to: 'New' },
    });
  });

  it('diffs a bare-array Json field (e.g. a note timeline), not just primitives', () => {
    const before = { notes: [{ id: '1', content: 'old' }] };
    const data = { notes: [{ id: '1', content: 'old' }, { id: '2', content: 'new' }] };
    expect(computeChanges(before, data)).toEqual({
      notes: { from: before.notes, to: data.notes },
    });
  });

  it('no-ops when a Json array field is unchanged', () => {
    const before = { notes: [{ id: '1', content: 'same' }] };
    const data = { notes: [{ id: '1', content: 'same' }] };
    expect(computeChanges(before, data)).toEqual({});
  });

  it('diffs a plain-object Json field written directly (no relation-op keys)', () => {
    const before = { metadata: { flag: false } };
    const data = { metadata: { flag: true } };
    expect(computeChanges(before, data)).toEqual({
      metadata: { from: { flag: false }, to: { flag: true } },
    });
  });

  it('still skips genuine relation nested-writes', () => {
    const before = { status: 'COLD' };
    const changes = computeChanges(before, {
      status: 'WARM',
      stakeholders: { create: [{ fullName: 'Jane' }] },
      client: { connect: { id: 'c1' } },
    });
    expect(changes).toEqual({ status: { from: 'COLD', to: 'WARM' } });
  });
});

describe('deriveAction', () => {
  it('CREATE for create/createMany/upsert', () => {
    expect(deriveAction('Candidate', 'create', null, {})).toBe('CREATE');
    expect(deriveAction('Candidate', 'createMany', null, {})).toBe('CREATE');
    expect(deriveAction('Candidate', 'upsert', null, {})).toBe('CREATE');
  });

  it('HARD_DELETE for delete/deleteMany', () => {
    expect(deriveAction('Role', 'delete', { id: 'r1' }, undefined)).toBe('HARD_DELETE');
    expect(deriveAction('Role', 'deleteMany', null, undefined)).toBe('HARD_DELETE');
  });

  it('SOFT_DELETE when deletedAt goes null → set', () => {
    const before = { deletedAt: null };
    expect(deriveAction('Candidate', 'update', before, { deletedAt: new Date() })).toBe(
      'SOFT_DELETE',
    );
  });

  it('RESTORE when deletedAt goes set → null', () => {
    const before = { deletedAt: new Date() };
    expect(deriveAction('Candidate', 'update', before, { deletedAt: null })).toBe('RESTORE');
  });

  it('DEACTIVATE for a Consultant set to isActive=false', () => {
    const before = { isActive: true };
    expect(deriveAction('Consultant', 'update', before, { isActive: false })).toBe('DEACTIVATE');
  });

  it('plain UPDATE otherwise', () => {
    const before = { status: 'COLD' };
    expect(deriveAction('Candidate', 'update', before, { status: 'WARM' })).toBe('UPDATE');
  });
});
