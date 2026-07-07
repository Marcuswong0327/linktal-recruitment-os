'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navGroups } from '@/config/nav';
import { NavUser, type SidebarUser } from '@/components/NavUser';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

// TODO: replace with the signed-in user once auth is wired up.
const currentUser: SidebarUser = {
  name: 'Johnson Chin',
  email: 'johnson@linktal.com',
};

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 px-2 py-1.5 font-semibold group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs">
            L
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">Linktal Recruitment OS</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, index) => {
          // Feature flag: drop items marked `hidden`.
          const items = group.items.filter((item) => !item.hidden);
          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group.label ?? index}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarMenu>
                {items.map((item) => {
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={!item.disabled && isActive}
                        disabled={item.disabled}
                        aria-disabled={item.disabled}
                        tooltip={item.disabled ? `${item.title} — coming soon` : item.title}
                        render={item.disabled ? undefined : <Link href={item.href} />}
                        className="gap-3"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
