/** Shared by Stakeholder and Candidate contact history — the fixed set of ways a contact can happen. */
export const CONTACT_TYPES = ['call', 'email', 'meeting', 'linkedin'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
