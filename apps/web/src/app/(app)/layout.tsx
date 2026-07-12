import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppSidebar } from '@/components/app-shell/AppSidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/sign-in');

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          user={{
            name: session.user?.name ?? 'Unknown',
            email: session.user?.email ?? '',
            avatar: session.user?.image ?? undefined,
          }}
          permissions={session.user?.permissions ?? []}
        />
        {/* h-svh + min-h-0/overflow-auto below: lock the shell to the viewport
            so grids scroll their own rows instead of the page. */}
        <SidebarInset className="h-svh">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
          </header>
          {/* bg-muted: --card and --background are both pure white in light
              mode, so cards need a tinted canvas to separate from. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-muted/50">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
