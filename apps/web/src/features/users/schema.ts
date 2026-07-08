// Roles map to the RBAC tiers in the spec (Workflow 1): Administrator, Manager, Consultant.
export const userRoles = ['ADMINISTRATOR', 'MANAGER', 'CONSULTANT'] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ['ACTIVE', 'INVITED', 'DISABLED'] as const;
export type UserStatus = (typeof userStatuses)[number];

export const userRoleLabels: Record<UserRole, string> = {
  ADMINISTRATOR: 'Administrator',
  MANAGER: 'Manager',
  CONSULTANT: 'Consultant',
};

export const userStatusLabels: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited',
  DISABLED: 'Disabled',
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Number of live job orders this consultant owns. */
  openJobOrders: number;
  lastActiveAt: string; // ISO date
  createdAt: string; // ISO date
};
