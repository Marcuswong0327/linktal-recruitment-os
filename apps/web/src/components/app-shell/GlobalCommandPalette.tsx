'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { hasPermission } from '@/config/nav';
import { pageCommands, actionCommands } from '@/config/commands';
import { useIsMac } from '@/hooks/use-is-mac';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';

const CommandPaletteContext = React.createContext<{ openPalette: () => void } | null>(null);

/** Lets any page (e.g. the dashboard's own search box) open the same palette instance the header trigger uses. */
export function useCommandPalette() {
  const ctx = React.useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  return ctx;
}

export function CommandPaletteProvider({
  permissions,
  isAdmin,
  children,
}: {
  permissions: string[];
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const auth = { permissions };
  const isMac = useIsMac();

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isPaletteShortcut =
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') ||
        // Alt+G only, not Cmd+G — Cmd/Ctrl+G is the browser's "Find Next" shortcut on Mac.
        (!isMac && e.altKey && e.key.toLowerCase() === 'g');
      if (isPaletteShortcut) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMac]);

  const visiblePages = pageCommands.filter(
    (item) => !item.hidden && !(item.adminOnly && !isAdmin) && hasPermission(auth, item.requiredPermission),
  );
  const visibleActions = actionCommands.filter((item) => hasPermission(auth, item.requiredPermission));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandPaletteContext.Provider value={{ openPalette: () => setOpen(true) }}>
      {children}

      <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette" description="Search pages and actions">
        <Command>
          <CommandInput placeholder="Search anything..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {visibleActions.length > 0 && (
              <CommandGroup heading="Actions">
                {visibleActions.map((action) => (
                  <CommandItem key={action.href} value={action.title} onSelect={() => go(action.href)}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <action.icon className="size-4" />
                    </span>
                    <span className="flex-1 truncate">{action.title}</span>
                    <span className="text-xs text-muted-foreground group-data-selected/command-item:text-primary/70">
                      {action.description}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Pages">
              {visiblePages.map((page) => (
                <CommandItem
                  key={page.href}
                  value={page.title}
                  disabled={page.disabled}
                  onSelect={() => go(page.href)}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-data-selected/command-item:bg-primary/15 group-data-selected/command-item:text-primary">
                    {page.icon && <page.icon className="size-4" />}
                  </span>
                  <span className="flex-1 truncate">{page.title}</span>
                  <span className="text-xs text-muted-foreground group-data-selected/command-item:text-primary/70">
                    {page.disabled ? 'Coming soon' : 'Page'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="-mx-1 -mb-1 mt-1 flex items-center justify-between border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="flex size-4 items-center justify-center rounded-sm bg-primary text-[9px] font-semibold text-primary-foreground">
                L
              </span>
              Linktal Recruitment OS
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> Navigate
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> Select
              </span>
            </span>
          </div>
        </Command>
      </CommandDialog>
    </CommandPaletteContext.Provider>
  );
}

/**
 * The clickable "Search anything..." box that opens the shared palette.
 * `size="sm"` is the compact header trigger; `size="lg"` is the dashboard's
 * full-width welcome-page search box — both open the exact same dialog.
 */
export function CommandPaletteTrigger({ size = 'sm', className }: { size?: 'sm' | 'lg'; className?: string }) {
  const { openPalette } = useCommandPalette();
  const isMac = useIsMac();

  if (size === 'lg') {
    return (
      <button
        type="button"
        onClick={openPalette}
        className={cn(
          'flex h-14 w-full items-center gap-3 rounded-2xl border-2 border-primary/20 bg-background px-4 text-left text-muted-foreground transition-colors hover:border-primary/40',
          className,
        )}
      >
        <Search className="size-5 shrink-0 text-primary" />
        <span className="flex-1 text-base">Search anything...</span>
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-0.5">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
          {!isMac && (
            <>
              <span className="text-muted-foreground">or</span>
              <span className="flex items-center gap-0.5">
                <Kbd>Alt</Kbd>
                <Kbd>G</Kbd>
              </span>
            </>
          )}
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={openPalette} className={cn('relative w-80 text-left', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <span className="flex h-9 w-full items-center rounded-2xl border border-transparent bg-input/50 pl-9 pr-3 text-sm text-muted-foreground transition-colors hover:bg-input">
        <span className="flex-1">Search anything...</span>
        <span className="flex items-center gap-0.5">
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </span>
    </button>
  );
}
