import { Building2, Contact, type LucideIcon } from 'lucide-react';
import { navGroups, type RequiredPermission } from '@/config/nav';

export type PageCommand = {
  title: string;
  href: string;
  icon: LucideIcon;
  hidden?: boolean;
  disabled?: boolean;
  adminOnly?: boolean;
  requiredPermission?: RequiredPermission;
};

/** Flattened, palette-friendly view of `navGroups` — one entry per page. */
export const pageCommands: PageCommand[] = navGroups.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    adminOnly: group.adminOnly,
    requiredPermission: item.requiredPermission ?? group.requiredPermission,
  })),
);

export type ActionCommand = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  requiredPermission?: RequiredPermission;
};

/**
 * Explicit, hand-picked list of "do something" commands (as opposed to plain
 * page navigation) — the GCP/AWS-style "Add a Stakeholder" entries.
 * Companies and Stakeholders have working create flows; Candidates/Job
 * Orders' add buttons are still `disabled` in their tables, so this stays a
 * short list until those ship.
 */
export const actionCommands: ActionCommand[] = [
  {
    title: 'Add Company',
    description: 'Create a new client company',
    href: '/companies?new=1',
    icon: Building2,
    requiredPermission: { resource: 'client', action: 'create' },
  },
  {
    title: 'Add Stakeholder',
    description: 'Create a new client contact',
    href: '/stakeholders?new=1',
    icon: Contact,
    requiredPermission: { resource: 'stakeholder', action: 'create' },
  },
];
