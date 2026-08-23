'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronRight } from 'lucide-react';
import { navGroups, filterNavGroups, type NavItem, type NavLeafItem, type NavParentItem } from '@/config/nav';
import { NavUser, type SidebarUser } from '@/components/app-shell/NavUser';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';

const isItemActive = (href: string, pathname: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

function NavLeaf({ item, pathname }: { item: NavLeafItem; pathname: string }) {
  const isActive = isItemActive(item.href, pathname);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={!item.disabled && isActive}
        disabled={item.disabled}
        aria-disabled={item.disabled}
        tooltip={item.disabled ? `${item.title} — coming soon` : item.title}
        render={item.disabled ? undefined : <Link href={item.href} />}
        className="gap-4"
      >
        {item.icon && <item.icon />}
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavParent({ item, pathname }: { item: NavParentItem; pathname: string }) {
  const hasActiveChild = item.items.some((child) => isItemActive(child.href, pathname));
  const [open, setOpen] = useState(hasActiveChild);

  // Auto-expand when navigation lands on a child; never auto-collapse, so
  // browsing within the group doesn't fight the user's manual toggle.
  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        {/* data-panel-open lives on the trigger element itself, so the "group" marking it
            has to sit here too — not on Root — for the chevron's group-data selector to match. */}
        <Collapsible.Trigger render={<SidebarMenuButton tooltip={item.title} className="group/collapsible gap-4" />}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
          <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[panel-open]/collapsible:rotate-90" />
        </Collapsible.Trigger>
        <Collapsible.Panel className="duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
          <SidebarMenuSub>
            {item.items.map((child) => (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  isActive={!child.disabled && isItemActive(child.href, pathname)}
                  aria-disabled={child.disabled}
                  render={child.disabled ? undefined : <Link href={child.href} />}
                >
                  {child.icon && <child.icon />}
                  <span>{child.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </Collapsible.Panel>
      </SidebarMenuItem>
    </Collapsible.Root>
  );
}

function NavMenuItem({ item, pathname }: { item: NavItem; pathname: string }) {
  return item.items ? <NavParent item={item} pathname={pathname} /> : <NavLeaf item={item} pathname={pathname} />;
}

export function AppSidebar({
  user,
  permissions,
  isAdmin = false,
}: {
  user: SidebarUser;
  permissions: string[];
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const visibleGroups = filterNavGroups(navGroups, { permissions, isAdmin });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-2 py-1.5 font-semibold group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs">
            L
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">Linktal Recruitment OS</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {visibleGroups.map((group, index) => (
          <SidebarGroup key={group.label ?? index}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => (
                <NavMenuItem key={item.href ?? item.title} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
