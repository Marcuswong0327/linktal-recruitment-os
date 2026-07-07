import { LayoutDashboard, Users, Cog, ScrollText, Building2, type LucideIcon, Contact, Mail, ClipboardList, SquareCheck, BriefcaseBusiness, MessageSquare, FileText, UsersRound, BookA } from 'lucide-react';

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  hidden?: boolean;
  disabled?: boolean;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
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
      { title: "Companies", href: "/companies", icon: Building2, disabled: true },
      { title: "Contacts", href: "/contacts", icon: Contact, disabled: true },
      { title: "Job Orders", href: "/job-orders", icon: BookA, disabled: true },
      { title: "Candidates", href: "/candidates", icon: UsersRound, disabled: true },
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
    items: [
      { title: "Users", href: "/users", icon: Users, disabled: true },
      { title: "Settings", href: "/settings", icon: Cog, disabled: true },
      { title: "Activity Log", href: '/activity-log', icon: ScrollText, disabled: true }],
  },
];
