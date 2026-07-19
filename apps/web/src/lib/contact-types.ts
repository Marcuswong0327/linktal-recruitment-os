// Mirrors apps/api/src/common/contact-types.ts — the fixed set of ways a
// contact can happen, shared by the Stakeholder and Candidate "log a
// contact" forms.
export const contactTypes = ['call', 'email', 'meeting', 'linkedin'] as const;
export type ContactType = (typeof contactTypes)[number];

export const contactTypeLabels: Record<ContactType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  linkedin: 'LinkedIn',
};

export const contactTypeOptions = contactTypes.map((value) => ({
  value,
  label: contactTypeLabels[value],
}));
