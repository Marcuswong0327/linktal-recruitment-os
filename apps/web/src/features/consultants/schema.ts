import { UpdateConsultantDtoRoleName } from '@/lib/api/generated/types';
import type { ConsultantEntity } from '@/lib/api/generated/types';

// The admin "users" panel is a view over the Consultant table — types come
// straight from the generated consultants API (the single source of truth).
export type Consultant = ConsultantEntity;

// The 6 RBAC roles seeded in apps/api/prisma/seed.ts.
export const consultantRoles = Object.values(UpdateConsultantDtoRoleName);
export type ConsultantRole = (typeof consultantRoles)[number];

export const consultantRoleLabels: Record<ConsultantRole, string> = {
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
export const consultantRoleTriggerClassName: Record<ConsultantRole, string> = {
  admin: 'border-primary/30 bg-primary/10 text-primary',
  manager: 'border-info/30 bg-info/10 text-info',
  finance: 'border-warning/30 bg-warning/10 text-warning',
  consultant: 'border-transparent bg-secondary text-secondary-foreground',
  researcher: 'border-transparent bg-accent text-accent-foreground',
  viewer: 'border-transparent bg-muted text-muted-foreground',
};
