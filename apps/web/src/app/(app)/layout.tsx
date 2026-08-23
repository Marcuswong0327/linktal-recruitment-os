import { auth } from '@/auth';
import { AddEntityButton } from '@/components/app-shell/AddEntityButton';
import { AppSidebar } from '@/components/app-shell/AppSidebar';
import { CommandPaletteProvider, CommandPaletteTrigger } from '@/components/app-shell/GlobalCommandPalette';
import { NotificationsToggle } from '@/components/app-shell/NotificationsToggle';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Gating on the API token (not mere session presence) already happens in
  // proxy.ts, before this layout ever renders — this call is just to read
  // session.user for the sidebar below.
  const session = await auth();
  const permissions = session?.user?.permissions ?? [];
  const isAdmin = session?.user?.roleName === 'admin';

  return (
    <TooltipProvider>
      <CommandPaletteProvider permissions={permissions} isAdmin={isAdmin}>
        <SidebarProvider>
          <AppSidebar
            user={{
              name: session?.user?.name ?? 'Unknown',
              email: session?.user?.email ?? '',
              roleName: session?.user?.roleName,
              avatar: session?.user?.image ?? undefined,
            }}
            permissions={permissions}
            isAdmin={isAdmin}
          />
          {/* h-svh + min-h-0/overflow-auto below: lock the shell to the viewport
              so grids scroll their own rows instead of the page. */}
          <SidebarInset className="h-svh">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="ml-auto flex items-center gap-2">
                <AddEntityButton permissions={permissions} />
                <CommandPaletteTrigger />
                <NotificationsToggle />
              </div>
            </header>
            {/* bg-muted: --card and --background are both pure white in light
                mode, so cards need a tinted canvas to separate from. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-muted/50">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </CommandPaletteProvider>
    </TooltipProvider>
  );
}
