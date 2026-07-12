// Relationship status tracking from the spec (Workflow 2): Cold / Warm / Traded / UNS.
export const relationshipStatuses = ['COLD', 'WARM', 'TRADED', 'UNS'] as const;
export type RelationshipStatus = (typeof relationshipStatuses)[number];

// Terms of Business tracking.
export const tobStatuses = ['NONE', 'SENT', 'SIGNED'] as const;
export type TobStatus = (typeof tobStatuses)[number];

export const relationshipStatusLabels: Record<RelationshipStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  TRADED: 'Traded',
  UNS: 'UNS',
};

export const tobStatusLabels: Record<TobStatus, string> = {
  NONE: 'No TOB',
  SENT: 'TOB Sent',
  SIGNED: 'TOB Signed',
};

export type Company = {
  id: string;
  name: string;
  industry: string;
  location: string;
  relationshipStatus: RelationshipStatus;
  tobStatus: TobStatus;
  stakeholderCount: number;
  openJobOrders: number;
  /** Consultant who owns the account. */
  owner: string;
  createdAt: string;
  updatedAt: string;
};
