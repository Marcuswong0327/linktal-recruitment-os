import { LayoutDashboard, Users, Cog, ScrollText, Building2, type LucideIcon, Contact, Mail, ClipboardList, SquareCheck, BriefcaseBusiness, MessageSquare, FileText, UsersRound, BookA, ShieldCheck } from 'lucide-react';

/** Same shape as the API's @RequirePermission(resource, action) decorator. */
export type RequiredPermission = { resource: string; action: string };

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  hidden?: boolean;
  disabled?: boolean;
  /** Only shown to users whose permission set includes this — mirrors the API's own check. */
  requiredPermission?: RequiredPermission;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
  /** Hides the whole group (all items) unless the user has this permission. */
  requiredPermission?: RequiredPermission;
  /** Hides the whole group unless the user is an admin (role-based, not permission). */
  adminOnly?: boolean;
};

/**
 * App navigation. Each entry in `navGroups` becomes a labeled section in the
 * sidebar. Add a page by dropping a new item into a group, or add a new group
 * for a whole new section — the sidebar renders from this list, nothing else
 * needs to change.
 */

export const navGroups: NavGroup[] = [
  {
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ]
  },
  {
    label: "OPERATIONS",
    items: [
      { title: "Companies", href: "/companies", icon: Building2 },
      { title: "Contacts", href: "/contacts", icon: Contact, disabled: true },
      { title: "Job Orders", href: "/job-orders", icon: BookA },
      { title: "Candidates", href: "/candidates", icon: UsersRound },
      { title: "Submissions", href: "/submissions", icon: FileText, disabled: true },
      { title: "Interviews", href: "/interviews", icon: MessageSquare, disabled: true },
      { title: "Placements", href: "/placements", icon: BriefcaseBusiness, disabled: true },
      { title: "Tasks", href: "/tasks", icon: SquareCheck, disabled: true },
      { title: "Inbox", href: "/inbox", icon: Mail, disabled: true },
      { title: "Reports", href: "/reports", icon: ClipboardList, disabled: true },
    ],
  },
  {
    label: "ADMIN",
    // User management (roles + active status) and the activity log are admin-only
    // IAM. The dedicated `user` permission was retired when /users folded into
    // /consultants, so this gates on the admin role directly.
    adminOnly: true,
    items: [
      { title: "Consultants", href: "/consultants", icon: Users },
      { title: "Roles", href: "/roles", icon: ShieldCheck },
      { title: "Settings", href: "/settings", icon: Cog, disabled: true },
      {
        title: "Activity Log",
        href: '/activity-log',
        icon: ScrollText,
        requiredPermission: { resource: 'audit', action: 'read' },
      }],
  },
];
