import { BookA, Building2, ClipboardList, Contact, User, type LucideIcon } from 'lucide-react';
import { navGroups, type NavItem, type RequiredPermission } from '@/config/nav';

export type PageCommand = {
  title: string;
  href: string;
  icon?: LucideIcon | null;
  hidden?: boolean;
  disabled?: boolean;
  adminOnly?: boolean;
  requiredPermission?: RequiredPermission;
};

/** `NavParentItem`s aren't navigable — only their leaf children are. */
const flattenNavItems = (items: NavItem[]) => items.flatMap((item) => (item.items ? item.items : [item]));

/** Flattened, palette-friendly view of `navGroups` — one entry per page. */
export const pageCommands: PageCommand[] = navGroups.flatMap((group) =>
  flattenNavItems(group.items).map((item) => ({
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
 * page navigation) — the GCP/AWS-style "Add a Stakeholder" entries. This is
 * the single source of truth for "everything the user can create" from
 * anywhere.
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
    title: 'Add Candidate',
    description: 'Create a new candidate',
    href: '/candidates?new=1',
    icon: User,
    requiredPermission: { resource: 'candidate', action: 'create' },
  },
  {
    title: 'Add Job Order',
    description: 'Open a new position for a client',
    href: '/job-orders?new=1',
    icon: ClipboardList,
    requiredPermission: { resource: 'job_order', action: 'create' },
  },
  {
    title: 'Add Stakeholder',
    description: 'Create a new client contact',
    href: '/stakeholders?new=1',
    icon: Contact,
    requiredPermission: { resource: 'stakeholder', action: 'create' },
  },
  {
    title: 'Add Job Opening Research',
    description: 'Log a job ad found in the market',
    href: '/job-opening-search?new=1',
    icon: BookA,
    requiredPermission: { resource: 'job_research', action: 'create' },
  },
];
