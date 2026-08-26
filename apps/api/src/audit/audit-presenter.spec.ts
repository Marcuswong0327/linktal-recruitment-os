import type { AuditLog } from '@prisma/client';
import { collectRefs, presentRow } from './audit-presenter';
import type { LabelMap, LabelRequest } from './label-resolver.service';

function row(overrides: Partial<AuditLog>): AuditLog {
  return {
    id: 'log-1',
    actorId: null,
    action: 'UPDATE',
    entityType: 'Candidate',
    entityId: 'cand-1',
    changes: null,
    metadata: null,
    createdAt: new Date('2026-08-06T00:00:00.000Z'),
    ...overrides,
  };
}

describe('collectRefs', () => {
  it('collects the row\'s own entity, the actor, and every fk-shaped diff value', () => {
    const rows = [
      row({
        actorId: 'consultant-1',
        changes: {
          industryId: { from: 'industry-1', to: 'industry-2' },
          status: { from: 'COLD', to: 'WARM' }, // enum — never collected as a label ref
          firstName: { from: 'Jan', to: 'Jane' }, // plain — never collected
        },
      }),
    ];
    const request: LabelRequest = new Map();
    collectRefs(rows, request);

    expect(request.get('Candidate')).toEqual(new Set(['cand-1']));
    expect(request.get('Consultant')).toEqual(new Set(['consultant-1']));
    expect(request.get('Industry')).toEqual(new Set(['industry-1', 'industry-2']));
  });

  it('skips the "(bulk)" sentinel entityId rather than requesting a label for it', () => {
    const rows = [row({ entityId: '(bulk)' })];
    const request: LabelRequest = new Map();
    collectRefs(rows, request);
    expect(request.has('Candidate')).toBe(false);
  });

  it('collects fk ids out of a CREATE snapshot (bare values, not {from,to})', () => {
    const rows = [row({ action: 'CREATE', changes: { industryId: 'industry-9', firstName: 'Jane' } })];
    const request: LabelRequest = new Map();
    collectRefs(rows, request);
    expect(request.get('Industry')).toEqual(new Set(['industry-9']));
  });

  it('walks a bulk write\'s metadata.where, including AND/OR/NOT and {in: [...]}', () => {
    const rows = [
      row({
        entityId: '(bulk)',
        metadata: {
          where: {
            AND: [{ industryId: { in: ['industry-1', 'industry-2'] } }, { locationId: { equals: 'location-5' } }],
          },
        },
      }),
    ];
    const request: LabelRequest = new Map();
    collectRefs(rows, request);
    expect(request.get('Industry')).toEqual(new Set(['industry-1', 'industry-2']));
    expect(request.get('Location')).toEqual(new Set(['location-5']));
  });

  it('never throws on a malformed/unexpected where shape', () => {
    const rows = [row({ entityId: '(bulk)', metadata: { where: { industryId: 42, AND: 'not-an-array-or-object' } } })];
    const request: LabelRequest = new Map();
    expect(() => collectRefs(rows, request)).not.toThrow();
  });
});

describe('presentRow — isActive renders as Active/Inactive, not Yes/No', () => {
  it('a Consultant deactivation reads as "Status: Active -> Inactive"', () => {
    const r = row({ entityType: 'Consultant', changes: { isActive: { from: true, to: false } } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges).toEqual([
      { field: 'isActive', fieldLabel: 'Status', from: { raw: true, label: 'Active', kind: 'plain' }, to: { raw: false, label: 'Inactive', kind: 'plain' } },
    ]);
  });
});

describe('presentRow — diff shape (UPDATE)', () => {
  it('resolves an fk id to its label and marks a since-deleted target', () => {
    const r = row({ changes: { industryId: { from: 'industry-1', to: 'industry-2' } } });
    const labels: LabelMap = new Map([
      ['Industry:industry-1', { label: 'Manufacturing', deleted: false }],
      ['Industry:industry-2', { label: 'Food', deleted: true }],
    ]);
    const presented = presentRow(r, labels, true);
    expect(presented.resolvedChanges).toEqual([
      {
        field: 'industryId',
        fieldLabel: 'Industry',
        from: { raw: 'industry-1', label: 'Manufacturing', kind: 'fk', targetType: 'Industry', deleted: false },
        to: { raw: 'industry-2', label: 'Food', kind: 'fk', targetType: 'Industry', deleted: true },
      },
    ]);
  });

  it('resolves an enum value to its display label', () => {
    const r = row({ changes: { status: { from: 'COLD', to: 'WARM' } } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges).toEqual([
      { field: 'status', fieldLabel: 'Status', from: { raw: 'COLD', label: 'Cold', kind: 'enum' }, to: { raw: 'WARM', label: 'Warm', kind: 'enum' } },
    ]);
  });

  it('hides bookkeeping fields (a soft-delete diff reads as no changes, not a timestamp)', () => {
    const r = row({ action: 'SOFT_DELETE', changes: { deletedAt: { from: null, to: '2026-08-06T00:00:00.000Z' } } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges).toEqual([]);
  });

  it('an id that can\'t be resolved (hard-purged) still shows the raw value, never throws', () => {
    const r = row({ changes: { industryId: { from: null, to: 'industry-missing' } } });
    const presented = presentRow(r, new Map(), true); // empty label map — nothing resolves
    expect(presented.resolvedChanges).toEqual([
      { field: 'industryId', fieldLabel: 'Industry', from: { raw: null, label: null, kind: 'fk', targetType: 'Industry' }, to: { raw: 'industry-missing', label: null, kind: 'fk', targetType: 'Industry', deleted: undefined } },
    ]);
  });
});

describe('presentRow — CREATE snapshot curation', () => {
  it('curates the full created row down to displayId + non-empty fields, and counts what it dropped', () => {
    const r = row({
      action: 'CREATE',
      changes: {
        id: 'cand-1',
        displayId: 'CDD-000999',
        firstName: 'Jane',
        lastName: null,
        email: null,
        status: 'COLD',
        createdAt: '2026-08-06T00:00:00.000Z',
        updatedAt: '2026-08-06T00:00:00.000Z',
        deletedAt: null,
        deletedById: null,
      },
    });
    const presented = presentRow(r, new Map(), true);
    const fields = presented.resolvedChanges!.map((c) => c.field);
    expect(fields).toEqual(['displayId', 'firstName', 'status']);
    expect(presented.omittedFieldCount).toBe(7); // id, lastName, email, createdAt, updatedAt, deletedAt, deletedById
  });

  it('a CREATE snapshot renders as a pseudo-diff (from: null)', () => {
    const r = row({ action: 'CREATE', changes: { displayId: 'CDD-000999' } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges![0].from).toEqual({ raw: null, label: null, kind: 'plain' });
  });
});

describe('presentRow — HARD_DELETE keeps the full before-image', () => {
  it('does not curate away null/empty fields the way CREATE does — this is the last surviving record', () => {
    const r = row({
      action: 'HARD_DELETE',
      changes: { id: 'cand-1', displayId: 'CDD-000999', firstName: 'Jane', lastName: null, createdAt: '2026-08-06T00:00:00.000Z' },
    });
    const presented = presentRow(r, new Map(), true);
    const fields = presented.resolvedChanges!.map((c) => c.field);
    // id/createdAt hidden (bookkeeping), but lastName (null) is KEPT — unlike CREATE.
    expect(fields).toEqual(['displayId', 'firstName', 'lastName']);
    expect(presented.omittedFieldCount).toBe(0); // curation counter only applies to CREATE
  });
});

describe('presentRow — sensitive-field redaction', () => {
  it('shows raw salary to an admin', () => {
    const r = row({ entityType: 'Consultant', changes: { salary: { from: 90000, to: 100000 } } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges![0].to).toEqual({ raw: 100000, label: '100000', kind: 'plain' });
  });

  it('redacts salary from a non-admin on both sides, regardless of raw value', () => {
    const r = row({ entityType: 'Consultant', changes: { salary: { from: 90000, to: 100000 } } });
    const presented = presentRow(r, new Map(), false);
    expect(presented.resolvedChanges![0].from).toEqual({ raw: null, label: null, kind: 'plain', redacted: true });
    expect(presented.resolvedChanges![0].to).toEqual({ raw: null, label: null, kind: 'plain', redacted: true });
  });

  it('does not redact a non-sensitive Consultant field for a non-admin', () => {
    const r = row({ entityType: 'Consultant', changes: { fullName: { from: 'A', to: 'B' } } });
    const presented = presentRow(r, new Map(), false);
    expect(presented.resolvedChanges![0].to.redacted).toBeUndefined();
  });
});

describe('presentRow — entity/actor labels', () => {
  it('resolves entityLabel and actorName from the same LabelMap the diff resolution uses', () => {
    const r = row({ actorId: 'consultant-1' });
    const labels: LabelMap = new Map([
      ['Candidate:cand-1', { label: 'CDD-000042 · Jane Doe', deleted: false }],
      ['Consultant:consultant-1', { label: 'CST-000005 · Sarah Chen', deleted: false }],
    ]);
    const presented = presentRow(r, labels, true);
    expect(presented.entityLabel).toBe('CDD-000042 · Jane Doe');
    expect(presented.entityDeleted).toBe(false);
    // The entity keeps its displayId (support quotes it, and two records can
    // share a name); the actor drops it — as the subject of a sentence it
    // pushed the person's name off the front of every entry.
    expect(presented.actorName).toBe('Sarah Chen');
  });

  it('leaves an actor label alone when it carries no displayId prefix', () => {
    const labels: LabelMap = new Map([['Consultant:consultant-1', { label: 'Sarah Chen', deleted: false }]]);
    expect(presentRow(row({ actorId: 'consultant-1' }), labels, true).actorName).toBe('Sarah Chen');
  });

  it('a "(bulk)" row never gets an entity label lookup', () => {
    const r = row({ entityId: '(bulk)' });
    const presented = presentRow(r, new Map(), true);
    expect(presented.entityLabel).toBeNull();
  });

  it('entityTypeLabel translates the raw Prisma model name for display', () => {
    expect(presentRow(row({ entityType: 'JobOrder' }), new Map(), true).entityTypeLabel).toBe('Job Order');
    expect(presentRow(row({ entityType: 'ConsultantIndustry' }), new Map(), true).entityTypeLabel).toBe('Industry Assignment');
    expect(presentRow(row({ entityType: 'Candidate' }), new Map(), true).entityTypeLabel).toBe('Candidate');
  });
});

describe('presentRow — a composite-key entity ("(unknown)" entityId) synthesizes a label from its own diff', () => {
  it('ConsultantIndustry — no single id to resolve, but the diff names a real consultant and industry', () => {
    const r = row({
      entityType: 'ConsultantIndustry',
      entityId: '(unknown)', // see prisma.extensions.ts's writeAudit fallback for a model with no scalar `id`
      action: 'CREATE',
      changes: { consultantId: 'consultant-1', industryId: 'industry-1' },
    });
    const labels: LabelMap = new Map([
      ['Consultant:consultant-1', { label: 'CST-000013 · Marcus Wong', deleted: false }],
      ['Industry:industry-1', { label: 'Manufacturing', deleted: false }],
    ]);
    const presented = presentRow(r, labels, true);
    expect(presented.entityLabel).toBe('CST-000013 · Marcus Wong · Manufacturing');
    expect(presented.entityTypeLabel).toBe('Industry Assignment');
  });

  it('falls back to null (never a raw "(unknown)") when nothing in the diff could be resolved either', () => {
    const r = row({ entityType: 'ConsultantIndustry', entityId: '(unknown)', changes: null });
    const presented = presentRow(r, new Map(), true);
    expect(presented.entityLabel).toBeNull();
  });
});

describe('presentRow — relation payloads and structured values', () => {
  it('drops a relation payload that has a scalar fk sibling, keeping the resolved one', () => {
    // A create snapshot carries both the column (`clientId`) and the relation
    // Prisma selected back (`client`). Both map to the field label "Client",
    // so keeping them printed the relationship twice — once resolved, once as
    // the literal text "[object Object]".
    const r = row({
      action: 'CREATE',
      entityType: 'Tob',
      changes: { clientId: 'client-1', client: { companyName: 'UOB Asset Management' }, fileName: 'terms.pdf' },
    });
    const labels: LabelMap = new Map([['Client:client-1', { label: 'CLI-001614 · UOB Asset Management', deleted: false }]]);
    const presented = presentRow(r, labels, true);
    const fields = presented.resolvedChanges!.map((c) => c.field);
    expect(fields).toEqual(['clientId', 'fileName']);
    expect(presented.resolvedChanges![0].to.label).toBe('CLI-001614 · UOB Asset Management');
  });

  it('does not count a dropped relation payload as an omitted field', () => {
    const r = row({ action: 'CREATE', entityType: 'Tob', changes: { clientId: 'client-1', client: { companyName: 'X' } } });
    // Only the duplicate went; nothing was hidden from the reader.
    expect(presentRow(r, new Map(), true).omittedFieldCount).toBe(0);
  });

  it('summarises an object with no fk sibling instead of rendering "[object Object]"', () => {
    const r = row({ action: 'CREATE', changes: { workHistory: [{ company: 'Acme', role: 'Fitter', period: '2020 - 2021' }] } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges![0].to.label).toBe('Acme · Fitter · 2020 - 2021');
  });

  it('renders an array of plain strings as a readable list', () => {
    const r = row({ action: 'CREATE', entityType: 'Client', changes: { addresses: ['12 Jalan Ampang', '4 Jalan Tun Razak'] } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges![0].to.label).toBe('12 Jalan Ampang; 4 Jalan Tun Razak');
  });

  it('falls back to a count when an array\'s objects have no scalar leaves at all', () => {
    const r = row({ action: 'CREATE', changes: { coverage: [{ nested: {} }, { nested: {} }] } });
    const presented = presentRow(r, new Map(), true);
    expect(presented.resolvedChanges![0].to.label).toBe('2 items');
  });
});

describe('presentRow — an entry names the records it covers', () => {
  const exportRow = (metadata: unknown) =>
    row({ action: 'EXPORT', entityType: 'Client', entityId: '(bulk)', metadata: metadata as never });

  it('resolves requestedIds to labels', () => {
    const labels: LabelMap = new Map([['Client:client-1', { label: 'CLI-001614 · UOB Asset Management', deleted: false }]]);
    expect(presentRow(exportRow({ requestedIds: ['client-1'], count: 1 }), labels, true).affectedRecords).toEqual([
      'CLI-001614 · UOB Asset Management',
    ]);
  });

  it('is null for a filtered export — there is no explicit list to name', () => {
    expect(presentRow(exportRow({ filters: { locationIds: ['loc-1'] }, count: 1528 }), new Map(), true).affectedRecords).toBeNull();
  });

  it('is null for every non-export action', () => {
    expect(presentRow(row({ metadata: { requestedIds: ['cand-1'] } }), new Map(), true).affectedRecords).toBeNull();
  });

  it('collectRefs requests labels for an export\'s named ids', () => {
    const request: LabelRequest = new Map();
    collectRefs([exportRow({ requestedIds: ['client-1', 'client-2'] })], request);
    expect(request.get('Client')).toEqual(new Set(['client-1', 'client-2']));
  });
});

describe('presentRow — id arrays resolve to names', () => {
  const roleRow = (permissionIds: string[]) =>
    row({ entityType: 'Role', changes: { permissionIds: { from: [], to: permissionIds } } });

  const labels: LabelMap = new Map([
    ['Permission:p1', { label: 'Candidate: read', deleted: false }],
    ['Permission:p2', { label: 'Client: update', deleted: false }],
  ]);

  it('renders permissionIds as permission names, not raw cuids', () => {
    const presented = presentRow(roleRow(['p1', 'p2']), labels, true);
    expect(presented.resolvedChanges![0].fieldLabel).toBe('Permissions');
    expect(presented.resolvedChanges![0].to).toMatchObject({
      kind: 'fk-list',
      label: 'Candidate: read, Client: update',
    });
  });

  it('counts ids it could not resolve rather than printing them raw', () => {
    const presented = presentRow(roleRow(['p1', 'gone-1', 'gone-2']), labels, true);
    expect(presented.resolvedChanges![0].to.label).toBe('Candidate: read, and 2 more');
  });

  it('an empty list reads as empty, not as an odd zero-length sentence', () => {
    expect(presentRow(roleRow([]), labels, true).resolvedChanges![0].to.label).toBeNull();
  });

  it('collectRefs gathers both sides of an id-array diff', () => {
    const request: LabelRequest = new Map();
    collectRefs([row({ entityType: 'Role', changes: { permissionIds: { from: ['p1'], to: ['p2', 'p3'] } } })], request);
    expect(request.get('Permission')).toEqual(new Set(['p1', 'p2', 'p3']));
  });
});

describe('presentRow — a JSON object shows its content, not its plumbing', () => {
  it('a candidate note reads as the note, dropping its id, author id and timestamp', () => {
    const r = row({
      changes: {
        notes: {
          from: [],
          to: [
            {
              id: 'cmsebvyeo0004ny0ticqp95vo',
              by: 'fa4ccdd0-d3ab-4ce3-a6c0-f6ce61a6344c',
              content: 'Very unprofessional',
              timestamp: '2026-08-11T14:47:08.181Z',
            },
          ],
        },
      },
    });
    expect(presentRow(r, new Map(), true).resolvedChanges![0].to.label).toBe('Very unprofessional');
  });

  it('de-duplicates a value stored under two keys', () => {
    const r = row({
      changes: { recipients: { from: [], to: [{ email: 'a@b.com', firstName: 'Marcus', toEmail: 'a@b.com' }] } },
    });
    expect(presentRow(r, new Map(), true).resolvedChanges![0].to.label).toBe('a@b.com · Marcus');
  });
});
