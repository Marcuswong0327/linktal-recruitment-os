'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridQuery } from '@/components/DataGrid';
import { DataGridFacetedFilter } from '@/components/DataGridFacetedFilter';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { downloadFile } from '@/lib/api/fetcher';
import {
  getExportAuditLogsUrl,
  useGetAuditActionCounts,
  useGetAuditEntityTypes,
  useGetAuditLogs,
} from '@/lib/api/generated/audit/audit';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { useInfinitePages } from '@/hooks/use-infinite-pages';
import type {
  ConsultantEntity,
  GetAuditLogsAction,
  GetAuditLogsParams,
  GetAuditLogsSortBy,
} from '@/lib/api/generated/types';
import { auditColumns } from './columns';
import { ActivityDetail } from './ActivityDetail';
import { ActivitySummaryStrip } from './ActivitySummaryStrip';
import { ActorFilter } from './ActorFilter';
import {
  actionFilterOptions,
  actionSpec,
  dayEndIso,
  dayStartIso,
  isoDay,
} from './schema';

// Matches every other infinite-scroll grid in the app (Candidates, Companies,
// Stakeholders, Consultants, Job Research).
const PAGE_SIZE = 50;

/** Nothing else on the page holds a stable empty array, and a fresh `[]` per render invalidates the consultant lookup's memo on every keystroke elsewhere. */
const NO_CONSULTANTS: ConsultantEntity[] = [];

interface Filters {
  action?: GetAuditLogsAction;
  entityType?: string;
  actorId?: string;
  /**
   * Every entry written by one request — one user action and everything it
   * cascaded to. Set only by the sheet's "show everything from this action"
   * link, never by a pill: nobody types a correlation id, they arrive at one
   * from an entry that had it.
   */
  requestId?: string;
  /** Local calendar dates (`YYYY-MM-DD`) — widened to day-bounding instants only when they reach the API. */
  from?: string;
  to?: string;
}

const FILTER_KEYS = ['action', 'entityType', 'actorId', 'requestId', 'from', 'to'] as const;

function isEmpty(f: Filters) {
  return FILTER_KEYS.every((k) => !f[k]);
}

function filtersEqual(a: Filters, b: Filters) {
  return FILTER_KEYS.every((k) => a[k] === b[k]);
}

/**
 * The applied filters as API params. `from`/`to` are held as plain calendar
 * dates everywhere the user can see them, and only widened here — `to` becomes
 * the *end* of that day in the reader's own timezone. Sending the bare date
 * meant the upper bound landed on midnight at the start of it, so "up to
 * today" returned nothing from today.
 */
function toQueryParams(f: Filters) {
  return {
    action: f.action,
    entityType: f.entityType,
    actorId: f.actorId,
    requestId: f.requestId,
    from: dayStartIso(f.from),
    to: dayEndIso(f.to),
  };
}

// --- URL state -------------------------------------------------------------

function filtersFromParams(params: URLSearchParams): Filters {
  const read = (k: (typeof FILTER_KEYS)[number]) => params.get(k) ?? undefined;
  return {
    action: read('action') as GetAuditLogsAction | undefined,
    entityType: read('entityType'),
    actorId: read('actorId'),
    requestId: read('requestId'),
    from: read('from'),
    to: read('to'),
  };
}

interface UrlState {
  filters: Filters;
  sortBy?: GetAuditLogsSortBy;
  sortOrder?: GetAuditLogsParams['sortOrder'];
}

/**
 * Push the applied view into the address bar via `history.replaceState`
 * rather than the router, so the log is bookmarkable and survives a refresh
 * without paying for a server round trip (and a scroll reset) on every filter
 * change. React state stays the source of truth after mount; the URL is a
 * mirror of it.
 */
function syncUrl({ filters, sortBy, sortOrder }: UrlState) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  // `page` is deliberately absent: with infinite scroll a link to "page 4"
  // would restore a window with the first three missing. Filters and sort
  // fully describe the view; the scroll position is not part of it.
  // Sort travels with the rest of it: a link that restores someone's filters
  // but silently drops the order they sorted by shows them different rows in
  // a different sequence and calls it the same view.
  if (sortBy) {
    params.set('sortBy', sortBy);
    if (sortOrder) params.set('sortOrder', sortOrder);
  }
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

// --- Presets ---------------------------------------------------------------

/**
 * One click from the two questions this page is actually opened to answer —
 * "what happened today" and "who touched what recently" — plus the two
 * highest-stakes action filters.
 *
 * Every preset maps onto filters the API can genuinely honour. There is
 * deliberately no combined "deletions & archives" preset: `action` is a single
 * value server-side, so such a preset could only be approximated, and quietly
 * showing half of what the label promises is the failure this tool's design
 * principles rank as its most expensive.
 */
interface Preset {
  label: string;
  filters: Filters;
  /** Hidden when there's no current consultant to resolve it against. */
  requiresActor?: boolean;
}

const PRESETS: Preset[] = [
  { label: 'Today', filters: { from: isoDay(0), to: isoDay(0) } },
  { label: 'Last 7 days', filters: { from: isoDay(-6), to: isoDay(0) } },
  { label: 'Permanent deletions', filters: { action: 'HARD_DELETE' } },
  { label: 'Exports', filters: { action: 'EXPORT' } },
  { label: 'My activity', filters: {}, requiresActor: true },
];

export function ActivityTable({ currentConsultantId }: { currentConsultantId?: string }) {
  const searchParams = useSearchParams();
  // Read once, on mount (lazy initialisers, never re-run): the URL seeds the
  // filters, and from then on `syncUrl` writes back to it. Re-reading would
  // fight the user's own edits.
  const [initial] = React.useState(() => filtersFromParams(new URLSearchParams(searchParams.toString())));

  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // Draft is what the filter controls show; applied is what actually drives
  // the query. They're split so picking filters doesn't search until "View
  // Activity" is clicked — same idea as Companies' search-gate action bar,
  // just without an empty-state gate before the first search.
  const [draftFilters, setDraftFilters] = React.useState<Filters>(initial);
  const [appliedFilters, setAppliedFilters] = React.useState<Filters>(initial);
  // Column-header sort is a separate affordance from the filter pills above
  // — it applies immediately on click, same as every other DataGrid page.
  const [sortBy, setSortBy] = React.useState<GetAuditLogsSortBy | undefined>(
    () => (searchParams.get('sortBy') as GetAuditLogsSortBy | null) ?? undefined,
  );
  const [sortOrder, setSortOrder] = React.useState<GetAuditLogsParams['sortOrder']>(() =>
    searchParams.get('sortOrder') === 'asc' ? 'asc' : searchParams.get('sortOrder') === 'desc' ? 'desc' : undefined,
  );
  const [isExporting, setIsExporting] = React.useState(false);

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : NO_CONSULTANTS;

  // Served by the API rather than hand-listed here. The hardcoded list this
  // replaces had drifted twice and was, at the time of writing, missing three
  // audited models plus every type that only ever appears on an export row —
  // so the filter silently could not reach rows the grid was already showing.
  const { data: entityTypesData } = useGetAuditEntityTypes();
  const entityTypeOptions = entityTypesData?.status === 200 ? entityTypesData.data : [];

  const queryParams = React.useMemo(() => toQueryParams(appliedFilters), [appliedFilters]);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetAuditLogs(
    { page, pageSize: PAGE_SIZE, ...queryParams, sortBy, sortOrder },
    { query: { placeholderData: keepPreviousData } },
  );

  const result = data?.status === 200 ? data.data : undefined;
  // Every page loaded so far, concatenated — what DataGrid's infiniteScroll
  // mode expects. Same hook the other five infinite grids use.
  const logs = useInfinitePages(result?.data, page, isFetching);

  // The action breakdown comes from an aggregate over *every* matching row,
  // not a tally of what's loaded — with infinite scroll a client-side count
  // would climb as you scrolled and never mean anything.
  // Sort deliberately not passed: it can't change a count, and including it
  // would refetch the whole breakdown every time a column header is clicked.
  const { data: countsData } = useGetAuditActionCounts(queryParams);
  const actionCounts = countsData?.status === 200 ? countsData.data : [];

  // Resolved from the live list by id rather than held as a snapshot, so a
  // background refetch (or an edit landing while the sheet is open) can't
  // leave the sheet showing a stale copy of the row behind it.
  const selected = React.useMemo(
    () => (selectedId ? (logs.find((l) => l.id === selectedId) ?? null) : null),
    [logs, selectedId],
  );

  const hasAppliedFilters = !isEmpty(appliedFilters);
  const isUnchanged = filtersEqual(draftFilters, appliedFilters);

  const apply = React.useCallback(
    (next: Filters) => {
      setDraftFilters(next);
      setAppliedFilters(next);
      setPage(1);
      syncUrl({ filters: next, sortBy, sortOrder });
    },
    [sortBy, sortOrder],
  );

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleQueryChange({ sorting }: DataGridQuery) {
    const sort = sorting[0];
    const nextSortBy = sort ? (sort.id as GetAuditLogsSortBy) : undefined;
    const nextSortOrder = sort ? (sort.desc ? 'desc' : 'asc') : undefined;
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    // Re-sorting reorders the whole result set, so page 3 of the old order
    // has nothing to do with page 3 of the new one — every other server-mode
    // grid in the app resets here (see DataGridServerProps.onQueryChange).
    setPage(1);
    syncUrl({ filters: appliedFilters, sortBy: nextSortBy, sortOrder: nextSortOrder });
  }

  // Routes through the server (not an in-browser build) so formatting stays
  // in one place and every export is logged — mirrors JobOrdersTable/
  // CompaniesTable's handleExport. Every row matching the currently applied
  // filters, unbounded — no row selection on this page.
  async function handleExport() {
    setIsExporting(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await downloadFile(getExportAuditLogsUrl({ ...queryParams, sortBy, sortOrder, timezone }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">
          Couldn&rsquo;t load the activity log: {error?.message ?? 'the server did not respond'}.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        {/* Presets apply on click — they're whole answers, not partial
            criteria, so making them wait behind View Activity would be a
            second click for no decision. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Jump to:</span>
          {PRESETS.filter((p) => !p.requiresActor || currentConsultantId).map((preset) => {
            const filters = preset.requiresActor ? { actorId: currentConsultantId } : preset.filters;
            const active = filtersEqual(appliedFilters, filters);
            return (
              <Button
                key={preset.label}
                variant={active ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={active}
                onClick={() => apply(active ? {} : filters)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <DataGridFacetedFilter
            title="Action"
            single
            options={actionFilterOptions}
            selected={draftFilters.action ? [draftFilters.action] : []}
            onChange={(values) => set('action', values[0] as GetAuditLogsAction | undefined)}
          />
          <DataGridFacetedFilter
            title="Record type"
            single
            options={entityTypeOptions}
            selected={draftFilters.entityType ? [draftFilters.entityType] : []}
            onChange={(values) => set('entityType', values[0])}
          />
          <ActorFilter
            consultants={consultants}
            value={draftFilters.actorId}
            onValueChange={(v) => set('actorId', v)}
          />
          <DateRangeFilter
            title="When"
            from={draftFilters.from}
            to={draftFilters.to}
            onChange={({ from, to }) => setDraftFilters((prev) => ({ ...prev, from, to }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              disabled={isEmpty(draftFilters) && !hasAppliedFilters}
              onClick={() => apply({})}
            >
              Reset
            </Button>
            {/* Enabled only when there's an actual change to apply. That
                covers the reported case (nothing entered yet on a fresh page)
                and the one it implies: clicking again with the same criteria,
                which previously looked like a button that did nothing. */}
            <Button
              onClick={() => apply(draftFilters)}
              disabled={isFetching || isUnchanged}
              title={isUnchanged ? 'Change a filter above to search' : undefined}
            >
              View Activity
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>
              <Download />
              {isExporting ? 'Exporting…' : 'Bulk Export'}
            </Button>
          </div>
        </div>

        {/* What the grid below is actually filtered on. Without it, editing a
            pill without applying leaves no way to tell which criteria the rows
            (and the Bulk Export button) are really honouring. */}
        {hasAppliedFilters || !isUnchanged ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground">Showing:</span>
            {hasAppliedFilters ? null : (
              <Badge variant="muted" className="rounded-md font-normal">
                All activity
              </Badge>
            )}
            <AppliedChips
              filters={appliedFilters}
              consultants={consultants}
              entityTypeOptions={entityTypeOptions}
              // "When" is one chip over two fields — clearing half of it
              // would leave an open-ended range nobody asked for.
              onRemove={(key) =>
                apply(
                  key === 'from'
                    ? { ...appliedFilters, from: undefined, to: undefined }
                    : { ...appliedFilters, [key]: undefined },
                )
              }
            />
            {/* Bulk Export sends the *applied* filters, so an unapplied edit
                means the button would download something other than what the
                pills read — say so rather than let the two quietly disagree. */}
            {!isUnchanged ? (
              <span className="text-xs text-warning">
                Filters above have changed — click View Activity to apply them.
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <ActivitySummaryStrip
        counts={actionCounts}
        activeAction={appliedFilters.action}
        onPickAction={(action) => apply({ ...appliedFilters, action })}
      />

      <DataGrid
        columns={auditColumns}
        data={logs}
        isLoading={isLoading}
        isFetching={isFetching}
        hideSearch
        columnSizingKey="audit"
        onRowClick={(row) => setSelectedId(row.id)}
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
          infiniteScroll: true,
          isFetchingNextPage: isFetching && page > 1,
        }}
        emptyState={
          hasAppliedFilters
            ? 'No activity matches these filters. Try widening the date range, or remove a filter above.'
            : 'No activity recorded yet. Entries appear here as people create, edit, archive and export records.'
        }
      />
      <ActivityDetail
        entry={selected}
        onClose={() => setSelectedId(null)}
        onShowAction={(requestId) => {
          // Replaces the filters rather than adding to them: "show everything
          // from this action" that silently kept an Action=Updated pill would
          // show some of it and call it everything.
          apply({ requestId });
          setSelectedId(null);
        }}
      />
    </>
  );
}

/** One removable chip per applied criterion, reading as the sentence the filter makes. */
function AppliedChips({
  filters,
  consultants,
  entityTypeOptions,
  onRemove,
}: {
  filters: Filters;
  consultants: ConsultantEntity[];
  entityTypeOptions: { value: string; label: string }[];
  onRemove: (key: keyof Filters) => void;
}) {
  const chips: { key: keyof Filters; title: string; label: string }[] = [];

  if (filters.action) {
    chips.push({ key: 'action', title: 'Action', label: actionSpec(filters.action).label });
  }
  if (filters.entityType) {
    const match = entityTypeOptions.find((o) => o.value === filters.entityType);
    chips.push({ key: 'entityType', title: 'Record type', label: match?.label ?? filters.entityType });
  }
  if (filters.actorId) {
    const match = consultants.find((c) => c.id === filters.actorId);
    chips.push({ key: 'actorId', title: 'Who', label: match?.fullName ?? 'Selected user' });
  }
  if (filters.requestId) {
    // Named for what it means, not what it is — the id itself is not something
    // anyone reads, and printing it would put a uuid back on the page.
    chips.push({ key: 'requestId', title: 'Showing', label: 'One action' });
  }
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? filters.from === filters.to
          ? filters.from
          : `${filters.from} → ${filters.to}`
        : filters.from
          ? `from ${filters.from}`
          : `up to ${filters.to}`;
    // One chip for the pair: clearing "from" alone leaves a half-range that
    // reads as a different, unasked-for filter.
    chips.push({ key: 'from', title: 'When', label });
  }

  return (
    <>
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="gap-1 rounded-md py-1 pr-1 font-normal">
          <span className="text-muted-foreground">{chip.title}:</span>
          {chip.label}
          <button
            type="button"
            aria-label={`Remove ${chip.title} filter: ${chip.label}`}
            onClick={() => onRemove(chip.key)}
            className="rounded-full opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </>
  );
}
