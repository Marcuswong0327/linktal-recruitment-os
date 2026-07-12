import { UpdateUserDtoRoleName } from '@/lib/api/generated/types';
import type { UserEntity } from '@/lib/api/generated/types';

// Types come straight from the generated API client, which is derived from
// the Prisma schema — the single source of truth. Don't hand-maintain shapes
// here.
export type User = UserEntity;

// The 6 RBAC roles seeded in apps/api/prisma/seed.ts.
export const userRoles = Object.values(UpdateUserDtoRoleName);
export type UserRole = (typeof userRoles)[number];

export const userRoleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  consultant: 'Consultant',
  finance: 'Finance',
  researcher: 'Researcher',
  viewer: 'Viewer',
};

// Semantic-token palette for the role select — success/destructive are
// reserved for the Status column (active/inactive), so roles use the
// remaining tokens, roughly by privilege level (admin = brand color, down to
// viewer = lowest emphasis).
export const userRoleTriggerClassName: Record<UserRole, string> = {
  admin: 'border-primary/30 bg-primary/10 text-primary',
  manager: 'border-info/30 bg-info/10 text-info',
  finance: 'border-warning/30 bg-warning/10 text-warning',
  consultant: 'border-transparent bg-secondary text-secondary-foreground',
  researcher: 'border-transparent bg-accent text-accent-foreground',
  viewer: 'border-transparent bg-muted text-muted-foreground',
};
