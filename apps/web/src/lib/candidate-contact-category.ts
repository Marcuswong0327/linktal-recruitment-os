import {
  CreateCandidateContactHistoryDtoCategory,
  CreateCandidateContactHistoryDtoOutreachChannel,
} from '@/lib/api/generated/types';

// Mirrors apps/api's ContactCategory/OutreachChannel enums — how a logged
// candidate contact is classified, and (for OUTREACH entries) which channel
// was used.
export const contactCategories = Object.values(CreateCandidateContactHistoryDtoCategory);
export type ContactCategory = (typeof contactCategories)[number];

export const contactCategoryLabels: Record<ContactCategory, string> = {
  SCREENING: 'Screening',
  OUTREACH: 'Outreach',
};

export const contactCategoryOptions = contactCategories.map((value) => ({
  value,
  label: contactCategoryLabels[value],
}));

export const outreachChannels = Object.values(CreateCandidateContactHistoryDtoOutreachChannel);
export type OutreachChannel = (typeof outreachChannels)[number];

export const outreachChannelLabels: Record<OutreachChannel, string> = {
  SMS: 'SMS',
  EMAIL: 'Email',
};

export const outreachChannelOptions = outreachChannels.map((value) => ({
  value,
  label: outreachChannelLabels[value],
}));
