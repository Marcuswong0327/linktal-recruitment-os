'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Clock, Search, UserRound, Users } from 'lucide-react';
import { keepPreviousData } from '@tanstack/react-query';
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
import { useRecentSearches, type RecentSearch } from '@/hooks/use-recent-searches';
import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetStakeholders } from '@/lib/api/generated/stakeholders/stakeholders';

/** Below this the query is too broad to be worth a round trip per keystroke. */
const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;
/** Per entity. Enough to recognise the one you meant without burying the Pages/Actions below. */
const RESULTS_PER_ENTITY = 5;

function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(' ').trim();
}

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

  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const { recents, remember } = useRecentSearches();

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Records are searched server-side; only fire once the palette is actually
  // open and there's enough of a query to narrow anything.
  const searchEnabled = open && debouncedQuery.length >= MIN_QUERY_LENGTH;
  const recordQuery = { query: { enabled: searchEnabled, placeholderData: keepPreviousData } };

  const { data: candidateData } = useGetCandidates(
    { q: debouncedQuery, pageSize: RESULTS_PER_ENTITY },
    recordQuery,
  );
  const { data: clientData } = useGetClients(
    { q: debouncedQuery, pageSize: RESULTS_PER_ENTITY },
    recordQuery,
  );
  const { data: stakeholderData } = useGetStakeholders(
    { q: debouncedQuery, pageSize: RESULTS_PER_ENTITY },
    recordQuery,
  );

  const candidateHits = searchEnabled && candidateData?.status === 200 ? candidateData.data.data : [];
  const clientHits = searchEnabled && clientData?.status === 200 ? clientData.data.data : [];
  const stakeholderHits =
    searchEnabled && stakeholderData?.status === 200 ? stakeholderData.data.data : [];

  // cmdk's own filtering is off (see `shouldFilter` below) because it would
  // re-filter server results against the raw query and drop valid hits — a
  // candidate matched on email doesn't contain the query in its title. Pages
  // and Actions therefore have to be filtered here instead.
  const matchesQuery = React.useCallback(
    (...fields: (string | undefined)[]) => {
      if (!query.trim()) return true;
      const needle = query.trim().toLowerCase();
      return fields.some((f) => f?.toLowerCase().includes(needle));
    },
    [query],
  );

  function openRecord(entry: RecentSearch) {
    remember(entry);
    go(entry.href);
  }

  const visiblePages = pageCommands.filter(
        (item) =>
      !item.hidden &&
      !(item.adminOnly && !isAdmin) &&
      hasPermission(auth, item.requiredPermission) &&
      matchesQuery(item.title),
  );
  const visibleActions = actionCommands.filter(
    (item) => hasPermission(auth, item.requiredPermission) && matchesQuery(item.title, item.description),
  );

  function go(href: string) {
    setOpen(false);
    // Leaves the palette ready for a fresh search next time it's opened,
    // rather than reopening onto the previous query's results.
    setQuery('');
    router.push(href);
  }

  return (
    <CommandPaletteContext.Provider value={{ openPalette: () => setOpen(true) }}>
      {children}

      <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette" description="Search pages and actions">
        {/* shouldFilter off: record results are already narrowed server-side,
            and cmdk's substring match against the item title would drop the
            ones matched on a field the title doesn't contain (an email, a
            phone number). Pages/Actions are filtered in this component. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search people, companies, pages…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Nothing typed yet — offer what was opened last rather than an
                empty panel. */}
            {!query.trim() && recents.length > 0 && (
              <CommandGroup heading="Recent">
                {recents.map((recent) => (
                  <CommandItem
                    key={`${recent.type}-${recent.id}`}
                    value={`recent-${recent.type}-${recent.id}`}
                    onSelect={() => openRecord(recent)}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-data-selected/command-item:bg-primary/15 group-data-selected/command-item:text-primary">
                      <Clock className="size-4" />
                    </span>
                    <span className="flex-1 truncate">{recent.label}</span>
                    <span className="truncate text-xs text-muted-foreground group-data-selected/command-item:text-primary/70">
                      {recent.secondary ?? recent.type}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {candidateHits.length > 0 && (
              <CommandGroup heading="Candidates">
                {candidateHits.map((candidate) => {
                  const label = fullName(candidate.firstName, candidate.lastName) || 'Unnamed candidate';
                  // Specialization first, industry as the fallback — a
                  // candidate's industry is required, its specializations
                  // aren't (only a small share are tagged).
                  const secondary = candidate.specializations?.[0] ?? candidate.industry ?? undefined;
                  return (
                    <CommandItem
                      key={candidate.id}
                      value={`candidate-${candidate.id}`}
                      onSelect={() =>
                        openRecord({
                          type: 'candidate',
                          id: candidate.id,
                          label,
                          secondary,
                          href: `/candidates/${candidate.id}`,
                        })
                      }
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <UserRound className="size-4" />
                      </span>
                      <span className="flex-1 truncate">{label}</span>
                      <span className="truncate text-xs text-muted-foreground group-data-selected/command-item:text-primary/70">
                        {secondary}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {clientHits.length > 0 && (
              <CommandGroup heading="Companies">
                {clientHits.map((client) => {
                  const secondary = client.specialization ?? client.industry ?? undefined;
                  return (
                    <CommandItem
                      key={client.id}
                      value={`company-${client.id}`}
                      onSelect={() =>
                        openRecord({
                          type: 'company',
                          id: client.id,
                          label: client.companyName,
                          secondary,
                          href: `/companies/${client.id}`,
                        })
                      }
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="size-4" />
                      </span>
                      <span className="flex-1 truncate">{client.companyName}</span>
                      <span className="truncate text-xs text-muted-foreground group-data-selected/command-item:text-primary/70">
                        {secondary}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {stakeholderHits.length > 0 && (
              <CommandGroup heading="Stakeholders">
                {stakeholderHits.map((stakeholder) => {
                  const label =
                    fullName(stakeholder.firstName, stakeholder.lastName) || 'Unnamed stakeholder';
                  // A stakeholder has no specialization or industry of its own
                  // — it inherits scope from its client — so the company it
                  // belongs to is what tells two similar names apart.
                  const secondary = stakeholder.companyName ?? undefined;
                  return (
                    <CommandItem
                      key={stakeholder.id}
                      value={`stakeholder-${stakeholder.id}`}
                      onSelect={() =>
                        openRecord({
                          type: 'stakeholder',
                          id: stakeholder.id,
                          label,
                          secondary,
                          href: `/stakeholders/${stakeholder.id}`,
                        })
                      }
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Users className="size-4" />
                      </span>
                      <span className="flex-1 truncate">{label}</span>
                      <span className="truncate text-xs text-muted-foreground group-data-selected/command-item:text-primary/70">
                        {secondary}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
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
            {visiblePages.length > 0 && (
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
            )}
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
