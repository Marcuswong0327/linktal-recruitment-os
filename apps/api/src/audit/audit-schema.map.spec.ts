import { Prisma } from '@prisma/client';
import { booleanLabel, describeField, enumLabel, fieldLabel } from './audit-schema.map';

// The set of models the Prisma extension actually audits (prisma.extensions.ts's
// AUDITED_MODELS) — kept as a literal list here rather than imported, since
// that constant isn't exported and duplicating a short, stable list is safer
// than reaching into the extension's internals from a test.
const AUDITED_MODELS = [
  'Client',
  'Stakeholder',
  'ClientJobResearch',
  'Candidate',
  'JobOrder',
  'CandidateSubmission',
  'Placement',
  'Interview',
  'Tob',
  'Consultant',
  'Role',
  'Permission',
  'ConsultantIndustry',
];

describe('describeField — every real DMMF relation is derived correctly', () => {
  for (const modelName of AUDITED_MODELS) {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
    if (!model) continue;

    for (const field of model.fields) {
      if (field.kind !== 'object' || field.relationFromFields?.length !== 1) continue;
      const scalarField = field.relationFromFields[0];

      it(`${modelName}.${scalarField} (backing the ${field.name} relation) resolves to fk -> ${field.type}`, () => {
        expect(describeField(modelName, scalarField)).toEqual({ kind: 'fk', targetType: field.type });
      });
    }
  }
});

// `/ById$/`, not a blanket `/Id$/` — a naive "/Id$/" match is exactly the
// wrong heuristic (see audit-schema.map.ts's doc): `displayId` and
// `Consultant.azureId` both end in "Id" and are genuinely NOT foreign keys
// (a business key and an external identity reference), so they must stay
// "plain". Only the columns schema.prisma itself documents as
// "Logical ref to Consultant.id (no FK)" belong here.
describe('describeField — every /ById$/ scalar on an audited model is a resolvable logical ref', () => {
  for (const modelName of AUDITED_MODELS) {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
    if (!model) continue;

    for (const field of model.fields) {
      if (field.kind !== 'scalar' || field.type !== 'String') continue;
      if (!/ById$/.test(field.name)) continue;
      // Already covered by a real relation (e.g. Tob.linktalRepresentativeId) —
      // no need for a LOGICAL_REFS entry, and asserting it here would be redundant.
      const hasRealRelation = model.fields.some(
        (f) => f.kind === 'object' && f.relationFromFields?.[0] === field.name,
      );
      if (hasRealRelation) continue;

      it(`${modelName}.${field.name} resolves to a logical fk, never silently "plain"`, () => {
        expect(describeField(modelName, field.name).kind).toBe('fk');
      });
    }
  }

  it('displayId and azureId are deliberately NOT treated as foreign keys', () => {
    expect(describeField('Candidate', 'displayId')).toEqual({ kind: 'plain' });
    expect(describeField('Consultant', 'azureId')).toEqual({ kind: 'plain' });
  });
});

describe('describeField — enum fields resolve to their real enum name', () => {
  it('Candidate.status is CandidateStatus', () => {
    expect(describeField('Candidate', 'status')).toEqual({ kind: 'enum', enumName: 'CandidateStatus' });
  });
  it('Placement.feeType is PlacementFeeType', () => {
    expect(describeField('Placement', 'feeType')).toEqual({ kind: 'enum', enumName: 'PlacementFeeType' });
  });
});

describe('describeField — a genuinely non-relational, non-enum field is "plain"', () => {
  it('Candidate.firstName', () => {
    expect(describeField('Candidate', 'firstName')).toEqual({ kind: 'plain' });
  });
  it('an unknown model/field never throws', () => {
    expect(describeField('NotAModel', 'notAField')).toEqual({ kind: 'plain' });
  });
});

describe('enumLabel', () => {
  it('renders every real enum value without degenerating to an empty or single-char string', () => {
    for (const e of Prisma.dmmf.datamodel.enums) {
      for (const v of e.values) {
        const label = enumLabel(e.name, v.name);
        expect(label.length).toBeGreaterThan(1);
      }
    }
  });

  it('overrides the one abbreviation Title Case gets wrong', () => {
    expect(enumLabel('CandidateStatus', 'UNS')).toBe('Unsuitable');
  });

  it('Title-Cases an ordinary multi-word value', () => {
    expect(enumLabel('JobOrderStatus', 'ON_HOLD')).toBe('On Hold');
  });

  it('an enum value not in the schema still renders something reasonable', () => {
    expect(enumLabel('SomeFutureEnum', 'NEW_VALUE')).toBe('New Value');
  });
});

describe('booleanLabel', () => {
  it('isActive renders as Active/Inactive, not Yes/No — its field label ("Status") is a noun, not a question', () => {
    expect(booleanLabel('isActive', true)).toBe('Active');
    expect(booleanLabel('isActive', false)).toBe('Inactive');
  });
  it('a field with a question-shaped label falls back to generic Yes/No', () => {
    expect(booleanLabel('isAccurate', true)).toBe('Yes');
    expect(booleanLabel('accountsNotified', false)).toBe('No');
  });
});

describe('fieldLabel', () => {
  it('uses the override for a field that reads badly generically', () => {
    expect(fieldLabel('consultantId')).toBe('Consultant');
  });
  it('falls back to camelCase -> Title Case for anything not overridden', () => {
    expect(fieldLabel('reportsToId')).toBe('Reports to id');
    expect(fieldLabel('currentCompany')).toBe('Current company');
  });
});
