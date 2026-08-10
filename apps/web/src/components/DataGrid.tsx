'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type FilterFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Search,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DataGridFacetedFilter,
  type FacetedFilterOption,
} from '@/components/DataGridFacetedFilter';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

const SELECT_COLUMN_ID = '__select';

export interface DataGridFilter {
  /** Column id (accessorKey) to filter on. */
  columnId: string;
  /** Label on the filter button. */
  title: string;
  /** Ignored when `render` is provided. */
  options?: FacetedFilterOption[];
  /** Single-select instead of multi (e.g. when the API takes one value). */
  single?: boolean;
  /**
   * Overrides the default checkbox-list filter UI (e.g. a searchable
   * combobox) while keeping this column's state, and the toolbar's
   * Clear/isFiltered handling, unified with the other filters.
   */
  render?: (props: { selected: string[]; onChange: (values: string[]) => void }) => React.ReactNode;
  /**
   * Renders this filter's trigger inside the column's header cell (a compact
   * icon button) instead of the toolbar row. State, "Clear" and isFiltered
   * behavior are unchanged — only where the trigger appears moves.
   */
  inHeader?: boolean;
  /**
   * Resolves a selected value to its display label, for the "Filters
   * applied" summary row. Falls back to looking the value up in `options`
   * when omitted — only needed for filters whose values aren't a static list
   * (e.g. a server-searched `render` filter like a location or consultant
   * combobox).
   */
  labelFor?: (value: string) => string;
  /**
   * Fully custom chip body for a selected value in the "Filters applied"
   * row — e.g. a consultant's avatar + name instead of plain text. Overrides
   * `labelFor`/`options` for that value; still wrapped in the same
   * removable chip shell (rounded pill + trailing ✕).
   */
  chipContent?: (value: string) => React.ReactNode;
}

/** Per-column presentation hints, set via `meta` on a ColumnDef. */
export interface DataGridColumnMeta {
  /** Align header and cells; use center for narrow numeric/pill columns. */
  align?: 'left' | 'center' | 'right';
  /**
   * Resize floor is the column's full measured content (header + widest
   * cell) instead of just its header. Use for columns rendering a pill/
   * control (badge, Select, Combobox) — a half-visible control looks
   * broken, unlike plain text, which is fine to shrink and clip.
   */
  strictMinSize?: boolean;
}

function columnAlignClass(meta: unknown): string | undefined {
  const align = (meta as DataGridColumnMeta | undefined)?.align;
  return align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : undefined;
}

/** Wraps `children` in a right-click menu when `content` is given; otherwise a passthrough. */
function OptionalContextMenu({
  content,
  open,
  onOpenChange,
  disabled,
  children,
}: {
  content: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blocks the native `contextmenu` listener outright — e.g. while a row drag is in progress. */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (!content) return <>{children}</>;
  return (
    <ContextMenu open={open} onOpenChange={onOpenChange} disabled={disabled}>
      <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">{children}</ContextMenuTrigger>
      <ContextMenuContent>{content}</ContextMenuContent>
    </ContextMenu>
  );
}

/** Search/sort/filter state reported to the caller in server mode. */
export interface DataGridQuery {
  search: string;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
}

export interface DataGridServerProps {
  /** Total rows across all pages (from the paginated response). */
  total: number;
  /** Current page, 1-based (controlled by the caller). */
  page: number;
  pageSize: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /**
   * Fires when search/sort/filter state changes (debounced for typing).
   * The caller maps this to API params and should reset the page to 1.
   */
  onQueryChange: (query: DataGridQuery) => void;
  /**
   * Infinite-scroll mode: no Prev/Next controls. Instead, `onPageChange(page
   * + 1)` fires automatically once the user scrolls near the last loaded
   * row. `data` must contain every row loaded so far (pages 1..page
   * concatenated), not just the current page — same as `onPageChange` would
   * otherwise require, just accumulated by the caller instead of replaced.
   */
  infiniteScroll?: boolean;
  /** A next-page fetch is in flight — shows a footer spinner and blocks re-triggering `onPageChange` (infiniteScroll only). */
  isFetchingNextPage?: boolean;
}

/** Keeps a row when its cell value is one of the selected filter values. */
const facetedFilterFn: FilterFn<unknown> = (row, columnId, filterValue) =>
  !Array.isArray(filterValue) || filterValue.length === 0
    ? true
    : filterValue.includes(row.getValue(columnId));

/** Raise-only merge — a column's measured width should only ever grow (header pass vs. cell pass), never shrink back down. */
function raiseSizes(prev: Record<string, number>, next: Record<string, number>) {
  const merged = { ...prev };
  let changed = false;
  for (const id in next) {
    if ((merged[id] ?? 0) < next[id]) {
      merged[id] = next[id];
      changed = true;
    }
  }
  return changed ? merged : prev;
}

interface DataGridProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Placeholder for the global search box. */
  searchPlaceholder?: string;
  /** Hides the built-in search box — for pages where search lives elsewhere (e.g. a dedicated search-first landing above the grid) so it isn't duplicated. Sorting/filtering still work as normal. */
  hideSearch?: boolean;
  /** Faceted (multi-select) filters shown in the toolbar. */
  filters?: DataGridFilter[];
  /** Rendered on the right side of the toolbar (filters, "Add" button, etc.). */
  toolbar?: React.ReactNode;
  /** Rendered in the footer, to the left of the row-count text (e.g. a primary "Add" action). */
  footerActions?: React.ReactNode;
  /** Fires when a row is clicked — used to open the entity detail drawer. */
  onRowClick?: (row: TData) => void;
  /** Shown when there are zero rows (before filtering). */
  emptyState?: React.ReactNode;
  /** Renders shimmer rows instead of data — use while the query is fetching. */
  isLoading?: boolean;
  /**
   * A background refetch is in flight (e.g. changing page with
   * `placeholderData: keepPreviousData`) — rows stay as-is (no skeleton
   * flash), but pagination controls disable and show a small spinner so a
   * page-change click isn't silently ignored while it resolves.
   */
  isFetching?: boolean;
  /** How many skeleton rows to show while loading. */
  skeletonRows?: number;
  /**
   * Server-driven mode: rows are rendered as-is (one page), and search, sort
   * and filters are reported via onQueryChange instead of applied locally.
   */
  server?: DataGridServerProps;
  /**
   * Stable row id for selection (defaults to row index, which is wrong once
   * paginated/filtered — pass this whenever `onSelectionChange` is used).
   */
  getRowId?: (row: TData) => string;
  /**
   * Adds a checkbox column and reports the selected row objects. Selection
   * is scoped to the currently visible page (cleared on page change) — this
   * app's tables are small enough that cross-page selection isn't worth the
   * added complexity of tracking rows no longer in `data`.
   */
  onSelectionChange?: (rows: TData[]) => void;
  /** Per-row override for whether a row's checkbox can be selected (default: all can). */
  canSelectRow?: (row: TData) => boolean;
  /**
   * Click-and-drag across rows to range-select, like a spreadsheet (mousedown
   * on one row, drag to another, release). Requires `onSelectionChange`.
   * Starting the drag on an interactive cell (marked `data-no-row-drag`) is
   * ignored so it doesn't fight that control's own click/open behavior.
   */
  enableRowRangeSelect?: boolean;
  /**
   * Hides the checkbox column while keeping `onSelectionChange`/selection
   * state itself — for tables where drag range-select is the only way rows
   * get picked, so the checkboxes would just be redundant UI.
   */
  hideSelectColumn?: boolean;
  /**
   * Right-click menu shown while at least one row is selected — the same
   * actions as `toolbar`'s bulk-actions menu, reachable by right-clicking
   * anywhere over the grid instead of only via that button. Ignored (no
   * special context menu) while nothing is selected.
   */
  selectionContextMenu?: React.ReactNode;
  /**
   * Default `true`: the grid's root and row-container use `flex-1 min-h-0`
   * so that, when every ancestor up to a viewport-bounded shell is also a
   * flex column, the grid fills the remaining height and scrolls its own
   * rows (header/footer stay put). Set `false` to opt out and let the grid
   * size to its actual content instead — for a page with a lot of its own
   * chrome above the grid (search bars, filter rows), where the intent is
   * for the *page* to scroll normally, not the grid internally. Relying on
   * an intervening non-flex wrapper to achieve the same thing doesn't
   * reliably work: `flex-1` is `flex-basis: 0%`, so an auto-height flex
   * column ancestor can still resolve to something other than pure content
   * height depending on the rest of the chain — this prop sidesteps that
   * by removing the flex-fill classes outright rather than trying to make
   * them inert.
   */
  fillHeight?: boolean;
}

export function DataGrid<TData>({
  columns,
  data,
  searchPlaceholder = 'Search…',
  hideSearch = false,
  filters,
  toolbar,
  footerActions,
  onRowClick,
  emptyState,
  isLoading = false,
  isFetching = false,
  skeletonRows = 8,
  server,
  getRowId,
  onSelectionChange,
  canSelectRow,
  fillHeight = true,
  enableRowRangeSelect = false,
  hideSelectColumn = false,
  selectionContextMenu,
}: DataGridProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelectionState] = React.useState<RowSelectionState>({});
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);

  // Mirrors `rowSelection` synchronously, alongside the (batched, one-tick-
  // delayed) state — a right-click needs to select its row *and* decide
  // whether to open the context menu within the same native event, and
  // `selectedRowModel` below is only fresh as of the last render, not the
  // handler that's still running. Every selection change goes through this
  // instead of the raw setter so the two never drift.
  const rowSelectionRef = React.useRef<RowSelectionState>(rowSelection);
  const setRowSelection = React.useCallback(
    (updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => {
      const next = typeof updater === 'function' ? updater(rowSelectionRef.current) : updater;
      rowSelectionRef.current = next;
      setRowSelectionState(next);
    },
    [],
  );

  // Selection is page-scoped (see onSelectionChange doc) — drop it when the
  // visible rows change out from under it. Bails out when already empty:
  // `data` isn't guaranteed referentially stable across renders, and
  // unconditionally setting a fresh `{}` would still swap the state
  // reference every time, which re-fires the onSelectionChange effect below,
  // which updates the caller's state, which re-renders this component with
  // (possibly) another new `data` reference — an infinite loop.
  //
  // In `server.infiniteScroll` mode `data` is the accumulated rows loaded so
  // far (see that prop's doc) — it grows every time the caller appends
  // another batch, which is a `data` reference change like any other but
  // shouldn't drop a selection made on already-loaded rows. Detected as a
  // pure append (every previously-loaded row, in order, is still a prefix of
  // the new array) rather than gated on `infiniteScroll` alone, so a filter/
  // sort/search change — which replaces the set outright even in infinite
  // mode — still clears it.
  const prevDataRef = React.useRef(data);
  React.useEffect(() => {
    const prev = prevDataRef.current;
    prevDataRef.current = data;
    const isAppend =
      server?.infiniteScroll &&
      getRowId &&
      data.length >= prev.length &&
      prev.every((row, i) => getRowId(row) === getRowId(data[i]));
    if (isAppend) return;
    setRowSelection((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [data, setRowSelection, server?.infiniteScroll, getRowId]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  // In server mode, report query state upward (debounced so typing in the
  // search box doesn't fire a request per keystroke). Skip the initial render:
  // the caller already holds the default state.
  const isServer = server !== undefined;
  const onQueryChangeRef = React.useRef(server?.onQueryChange);
  onQueryChangeRef.current = server?.onQueryChange;
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (!isServer) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onQueryChangeRef.current?.({ search: globalFilter, sorting, columnFilters });
    }, 300);
    return () => clearTimeout(timer);
  }, [isServer, globalFilter, sorting, columnFilters]);

  // Natural width each column actually needs — the wider of its header
  // content (label + sort icon) and its widest rendered cell on the page
  // that first loaded. Used, when a column doesn't hardcode a `size`, as its
  // starting width — a fixed guess goes stale the moment a column's content
  // changes (e.g. plain text becoming a pill), and a single flat default
  // ignores that different columns need different amounts of room. Measuring
  // the real DOM is the only thing that can't drift out of sync with what's
  // actually rendered.
  const [measuredSizes, setMeasuredSizes] = React.useState<Record<string, number>>({});
  // Header-only subset of the above — the resize floor for plain-text
  // columns. Unlike a pill/control, clipped text isn't broken, so those
  // columns should stay shrinkable well past their widest cell value; only
  // `meta.strictMinSize` columns use the fuller `measuredSizes` floor instead.
  const [headerOnlySizes, setHeaderOnlySizes] = React.useState<Record<string, number>>({});

  // Attach the faceted filter fn to whichever columns are declared filterable.
  const filterColumnIds = React.useMemo(
    () => new Set((filters ?? []).map((f) => f.columnId)),
    [filters],
  );
  const headerFilterByColumnId = React.useMemo(() => {
    const map = new Map<string, DataGridFilter>();
    for (const f of filters ?? []) {
      if (f.inHeader) map.set(f.columnId, f);
    }
    return map;
  }, [filters]);
  const tableColumns = React.useMemo(() => {
    const withFilters = columns.map((col) => {
      const id =
        (col as { id?: string; accessorKey?: string }).id ??
        (col as { accessorKey?: string }).accessorKey;
      let result = col;
      if (id && filterColumnIds.has(id)) {
        result = { ...result, filterFn: facetedFilterFn as FilterFn<TData> };
      }
      const measured = id ? measuredSizes[id] : undefined;
      if (measured !== undefined) {
        const strict = (result.meta as DataGridColumnMeta | undefined)?.strictMinSize;
        const minFloor = strict ? measured : id ? headerOnlySizes[id] : undefined;
        result = {
          ...result,
          minSize: Math.max(minFloor ?? 0, result.minSize ?? 0),
          // An explicit columnDef.size is a deliberate override (e.g.
          // intentionally forcing truncation) — respect it. Otherwise the
          // measured width *is* the default, not a floor under a guess.
          size: result.size ?? measured,
        };
      }
      return result;
    });
    if (!onSelectionChange || hideSelectColumn) return withFilters;

    const selectColumn: ColumnDef<TData, unknown> = {
      id: SELECT_COLUMN_ID,
      size: 40,
      enableResizing: false,
      header: ({ table }) => (
        // Checkbox renders a visible span *and* a hidden input as siblings —
        // clicking the span re-dispatches a bubbling click on that sibling
        // input, which stopPropagation on the Checkbox itself can't catch
        // (it never passes back through the span). Stop it here instead,
        // on a shared ancestor of both.
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(!!checked)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            disabled={!row.getCanSelect()}
            aria-label="Select row"
          />
        </div>
      ),
    };
    return [selectColumn, ...withFilters];
  }, [
    columns,
    filterColumnIds,
    onSelectionChange,
    hideSelectColumn,
    measuredSizes,
    headerOnlySizes,
  ]);

  const gridContainerRef = React.useRef<HTMLDivElement>(null);
  // Wraps the whole component (toolbar + grid + footer) — used to detect
  // clicks outside the entire DataGrid, not just the bordered rows box, so
  // e.g. clicking the search input doesn't count as "outside".
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Pass 1: header-only sizing. Runs as soon as headers render, independent
  // of loading state — cell content isn't available yet while `isLoading`,
  // and falling back to defaultColumn.size in the meantime made the loading
  // skeleton render far wider than the eventual (properly fitted) table,
  // producing a jarring wide-then-narrow snap once data arrived.
  React.useLayoutEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;
    const next: Record<string, number> = {};
    container.querySelectorAll<HTMLElement>('thead [data-measure-column]').forEach((el) => {
      const id = el.dataset.measureColumn;
      if (!id) return;
      // th padding (px-3 = 0.75rem each side) isn't part of the span itself.
      // +28 extra when this column also carries a header-embedded filter
      // trigger (icon-sm button) sitting next to the label, which the
      // measured span itself doesn't include.
      const filterAllowance = headerFilterByColumnId.has(id) ? 28 : 0;
      next[id] = Math.ceil(el.scrollWidth) + 24 + filterAllowance;
    });
    setMeasuredSizes((prev) => raiseSizes(prev, next));
    setHeaderOnlySizes((prev) => raiseSizes(prev, next));
  }, [columns, headerFilterByColumnId]);

  // Re-measure pass 2 (see effect below) once per column set — header
  // labels/cell kinds don't otherwise change; new columns showing up should
  // still get properly fitted the same way.
  const measuredOnceRef = React.useRef(false);
  React.useEffect(() => {
    measuredOnceRef.current = false;
  }, [columns]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, globalFilter, columnFilters, rowSelection, columnSizing },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: setColumnSizing,
    getRowId: getRowId as ((row: TData) => string) | undefined,
    enableRowSelection: !onSelectionChange
      ? false
      : canSelectRow
        ? (row) => canSelectRow(row.original)
        : true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    // Undeclared-size columns previously shared remaining space equally via
    // table-fixed's own layout; resizing requires every column to carry an
    // explicit width, so give those a sensible starting width instead.
    defaultColumn: { size: 200, minSize: 60, maxSize: 600 },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualSorting: isServer,
    manualFiltering: isServer,
    // Without this, table-core's autoResetPageIndex (on by default) queues a
    // resetPageIndex() on every core row model recompute. In server mode our
    // `data`/`columns` props are rebuilt each render (e.g. name-lookup
    // callbacks depending on freshly-fetched arrays), so that reset kept
    // firing every render — each one a state update that triggers another
    // render — an infinite "Maximum update depth exceeded" loop. Pagination
    // is already handled externally here (see `server`), so tell table-core
    // not to manage or auto-reset it itself.
    manualPagination: isServer,
  });

  const onSelectionChangeRef = React.useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const selectedRowModel = table.getSelectedRowModel();
  // Deliberately depend on rowSelection (real state) rather than
  // selectedRowModel (a fresh array every render) — the latter would fire
  // this every render instead of only when selection actually changes.
  React.useEffect(() => {
    onSelectionChangeRef.current?.(selectedRowModel.rows.map((r) => r.original));
  }, [rowSelection]);

  const isFiltered = columnFilters.length > 0 || globalFilter !== '';

  function resetFilters() {
    setColumnFilters([]);
    setGlobalFilter('');
  }

  const rows = table.getRowModel().rows;
  const hasData = data.length > 0;
  const totalColumns = table.getAllLeafColumns().length;

  // Row range-select: mousedown on a row, drag to another, release — like
  // dragging across cells in a spreadsheet. `dragStateRef` (not state) tracks
  // the gesture without re-rendering on every pixel of mouse movement;
  // `moved` distinguishes a genuine drag from a plain click so a click still
  // reaches `onRowClick` (e.g. navigating to the row's detail page)
  // untouched, and a drag suppresses that click instead of also navigating.
  const dragStateRef = React.useRef<{ anchorId: string; moved: boolean } | null>(null);
  // Latest pointer position during a drag — read by the auto-scroll rAF loop
  // below, which needs it on frames where no mousemove fired.
  const dragPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const [isRowDragging, setIsRowDragging] = React.useState(false);

  const rowIndexById = React.useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.id, i));
    return map;
  }, [rows]);

  // Extends the selection from the drag's anchor row up to `rowId`. Shared by
  // the per-row `mouseenter` handler (fast movement over already-loaded rows)
  // and the auto-scroll loop below (which hit-tests the row under the cursor
  // itself, since rows sliding under a *stationary* cursor during auto-scroll
  // never fire a native `mouseenter`).
  const applySelectionRange = React.useCallback(
    (rowId: string) => {
      const state = dragStateRef.current;
      if (!state) return;
      state.moved = true;
      setIsRowDragging(true);
      const anchorIdx = rowIndexById.get(state.anchorId);
      const currentIdx = rowIndexById.get(rowId);
      if (anchorIdx === undefined || currentIdx === undefined) return;
      const [lo, hi] = anchorIdx <= currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
      const next: RowSelectionState = {};
      for (let i = lo; i <= hi; i++) {
        const r = rows[i];
        if (r.getCanSelect()) next[r.id] = true;
      }
      setRowSelection(next);
    },
    [rowIndexById, rows],
  );

  const handleRowMouseEnter = React.useCallback(
    (row: Row<TData>) => applySelectionRange(row.id),
    [applySelectionRange],
  );

  // Auto-scroll + selection-extension while dragging near the top/bottom edge
  // of the grid's scroll container — the same gesture a spreadsheet supports:
  // drag past the visible rows and it scrolls (and, here, paginates via the
  // existing `loadMoreRef` sentinel/IntersectionObserver as more rows scroll
  // into view) to keep extending the selection, rather than the drag simply
  // stalling once it reaches the last rendered row.
  //
  // Runs on a rAF loop instead of `mousemove` alone because the selection
  // needs to keep extending even while the pointer sits still at the edge —
  // rows are moving under it, not the other way around, so nothing else would
  // keep firing. The loop itself only runs while a drag is in flight (started
  // in handleRowMouseDown, stopped on mouseup) rather than for the component's
  // whole lifetime, so it isn't burning a frame callback while idle.
  const autoScrollFrameRef = React.useRef<number | null>(null);

  const stopAutoScrollLoop = React.useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const startAutoScrollLoop = React.useCallback(() => {
    if (autoScrollFrameRef.current !== null) return; // already running
    const EDGE_ZONE = 48; // px from the container's top/bottom edge
    const MAX_SCROLL_SPEED = 16; // px per frame, at the very edge
    // Seeded with the anchor row, not null — otherwise the very first tick
    // (pointer still sitting wherever mousedown happened, before any actual
    // movement) always counts as a "new" hit against `null` and immediately
    // calls applySelectionRange, marking a plain, stationary click as a real
    // drag. That's harmless on inert cells, but it fires a state update
    // between this mousedown and its mouseup — enough to have broken a
    // nested control's own click (e.g. TagMultiSelect's picker) on a cell
    // that isn't marked data-no-row-drag.
    let lastHitRowId: string | null = dragStateRef.current?.anchorId ?? null;

    function tick() {
      const pointer = dragPointerRef.current;
      if (!dragStateRef.current || !pointer) {
        autoScrollFrameRef.current = null;
        return;
      }
      autoScrollFrameRef.current = requestAnimationFrame(tick);

      const scrollEl = gridContainerRef.current?.querySelector<HTMLElement>(
        '[data-slot="table-container"]',
      );
      if (!scrollEl) return;
      const rect = scrollEl.getBoundingClientRect();

      const distFromTop = pointer.y - rect.top;
      const distFromBottom = rect.bottom - pointer.y;
      if (distFromTop >= 0 && distFromTop < EDGE_ZONE) {
        scrollEl.scrollTop -= MAX_SCROLL_SPEED * (1 - distFromTop / EDGE_ZONE);
      } else if (distFromBottom >= 0 && distFromBottom < EDGE_ZONE) {
        scrollEl.scrollTop += MAX_SCROLL_SPEED * (1 - distFromBottom / EDGE_ZONE);
      }

      // Hit-test the row under the pointer directly, rather than relying on
      // `mouseenter` — the pointer may not have moved at all this frame even
      // though auto-scroll just brought new rows underneath it.
      const clampedY = Math.min(Math.max(pointer.y, rect.top + 1), rect.bottom - 1);
      const target = document
        .elementFromPoint(pointer.x, clampedY)
        ?.closest<HTMLElement>('[data-row-id]');
      const hitRowId = target?.dataset.rowId;
      if (hitRowId && hitRowId !== lastHitRowId) {
        lastHitRowId = hitRowId;
        applySelectionRange(hitRowId);
      }
    }
    autoScrollFrameRef.current = requestAnimationFrame(tick);
  }, [applySelectionRange]);

  // Cancel a still-running loop if the component unmounts mid-drag.
  React.useEffect(() => stopAutoScrollLoop, [stopAutoScrollLoop]);

  const handleRowMouseDown = React.useCallback(
    (e: React.MouseEvent, row: Row<TData>) => {
      if (!enableRowRangeSelect || e.button !== 0) return;
      // Unconditional, even for cells this function goes on to exclude below
      // — a mousedown on, say, a Role trigger that turns into any drag (even
      // just clicking to open its popup, then moving a little before mouseup)
      // is otherwise never told to suppress the browser's *native* multi-row
      // text selection, since the early return below happens first and this
      // line was never reached. That's a completely different mechanism from
      // this component's own row-range-select below — no dragStateRef, no
      // React state — just the browser doing what an unprevented mousedown+
      // drag always does, and it reads exactly like "everything between got
      // selected" because, natively, it did.
      e.preventDefault();
      // Let interactive cells (pills, comboboxes, the row's own link) handle
      // their own mousedown — starting a drag from inside one would fight
      // its click/open behavior. The role check is a second line of defense
      // for *portaled* popup content (a Select/Combobox option list): React
      // bubbles its events up through the component tree regardless of where
      // the portal actually mounts in the DOM, but the target's real DOM
      // ancestors are wherever that portal root is — never inside this row —
      // so a plain `.closest('[data-no-row-drag]')` on the native target
      // can't see it.
      //
      // The `[data-open]` check is the one that actually matters: any
      // base-ui popup (Select, Combobox, Menu, ...) stamps this on itself
      // globally while open, so it catches every case in one shot regardless
      // of which exact element the click landed on inside it — an open
      // Role/Status/tag popup means "don't start a row drag from *any*
      // click, anywhere," not just clicks whose target happens to carry the
      // right role. Role/Status opening its own popup is exactly this case:
      // the trigger's own mousedown is caught by data-no-row-drag, but
      // choosing an option afterward is a *second*, separate mousedown, and
      // this is what stops that one from anchoring a drag here instead.
      if (
        (e.target as HTMLElement).closest(
          '[data-no-row-drag], [role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="option"], [role="tooltip"]',
        ) ||
        document.querySelector('[data-open]')
      ) {
        return;
      }
      dragStateRef.current = { anchorId: row.id, moved: false };
      dragPointerRef.current = { x: e.clientX, y: e.clientY };
      startAutoScrollLoop();
    },
    [enableRowRangeSelect, startAutoScrollLoop],
  );

  // Right-clicking a row that isn't already part of the selection selects
  // just that row (replacing whatever was selected before) — same convention
  // as Notion/Finder/Sheets. Right-clicking a row that's *already* selected
  // leaves an existing multi-selection alone, so the menu applies to all of
  // them. Uses the synchronous ref (not `setRowSelection`'s batched state) so
  // `onOpenChange` below sees the up-to-date selection within this same
  // native event, not last render's.
  const handleRowContextMenu = React.useCallback(
    (row: Row<TData>) => {
      if (!selectionContextMenu || !row.getCanSelect()) return;
      if (!row.getIsSelected()) {
        setRowSelection({ [row.id]: true });
      }
    },
    [selectionContextMenu, setRowSelection],
  );

  // Tracks pointer position during a drag — the auto-scroll loop needs it on
  // frames where the pointer didn't move but rows still scrolled underneath.
  React.useEffect(() => {
    if (!enableRowRangeSelect) return;
    function handleMouseMove(e: MouseEvent) {
      if (!dragStateRef.current) return;
      dragPointerRef.current = { x: e.clientX, y: e.clientY };
    }
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [enableRowRangeSelect]);

  // Ends the drag wherever the mouse is released, even outside the table.
  // Marking a completed drag here (rather than in the row's own onMouseUp)
  // is what lets the row under the cursor suppress its onClick — the click
  // that follows mouseup would otherwise also fire `onRowClick`.
  React.useEffect(() => {
    if (!enableRowRangeSelect) return;
    function handleMouseUp() {
      if (dragStateRef.current?.moved) {
        suppressNextClickRef.current = true;
      }
      dragStateRef.current = null;
      dragPointerRef.current = null;
      stopAutoScrollLoop();
      setIsRowDragging(false);
    }
    // Capture phase, not bubble — a popup item's own click handler (Select,
    // Combobox) commonly calls stopPropagation so outer "click away"
    // listeners don't also fire for the same click. A bubble-phase listener
    // here would never run in that case, leaving dragStateRef dangling with
    // whatever row the popup belonged to — live until the next animation
    // frame hit-tests wherever the pointer physically was (often a different
    // row, once the popup closes), silently starting a phantom range select.
    // Capture listeners run top-down before any bubble-phase stopPropagation
    // has a chance to fire, so this cleanup is unconditional: it always
    // clears the drag on any mouseup, anywhere, regardless of what a
    // descendant does with the event afterward.
    document.addEventListener('mouseup', handleMouseUp, true);
    return () => document.removeEventListener('mouseup', handleMouseUp, true);
  }, [enableRowRangeSelect, stopAutoScrollLoop]);

  // Clicking outside the whole component clears the current selection, like
  // a spreadsheet. Popup content (menus, dialogs, comboboxes, tooltips) is
  // portaled elsewhere in the DOM, so it wouldn't otherwise be seen as
  // "inside" — excluded by role instead, so e.g. confirming a bulk-delete in
  // its dialog doesn't clear the selection out from under the action.
  React.useEffect(() => {
    if (!onSelectionChange) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (rootRef.current?.contains(target)) return;
      if (
        target.closest(
          '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="tooltip"]',
        )
      ) {
        return;
      }
      setRowSelection((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onSelectionChange]);

  // Infinite scroll: observes a sentinel row placed after the last loaded
  // row and requests the next page once it scrolls into view. IntersectionObserver's
  // default root (the viewport) still correctly reports visibility through
  // the table's own nested scroll container, so no explicit root wiring is
  // needed here.
  //
  // `server` is a fresh object literal every render (the caller passes
  // `server={{ ... }}` inline), so a ref callback that closed over it
  // directly would tear down and recreate the observer on every render —
  // and since `observer.observe()` fires its callback immediately with the
  // *current* intersection state, recreating it while the sentinel is still
  // in view (e.g. right after loading a page, before new rows push it
  // off-screen) re-fires `onPageChange` again before `isFetchingNextPage`
  // has had a chance to become true, snowballing into duplicate page
  // fetches. Reading `server` from a ref instead keeps the callback fresh
  // without ever recreating the observer itself.
  const serverRef = React.useRef(server);
  serverRef.current = server;
  const loadMoreRef = React.useCallback((node: HTMLTableRowElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const s = serverRef.current;
        if (!s?.infiniteScroll) return;
        if (entry?.isIntersecting && s.page < s.pageCount && !s.isFetchingNextPage) {
          s.onPageChange(s.page + 1);
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Pass 2: refine upward with actual cell content once real rows are
  // available (a short header like "TOB" undersells the pill it holds). Cell
  // content depends on which page/rows are loaded — measuring on every data
  // change would make columns drift width as you page through, which
  // table-fixed was chosen specifically to avoid. So this only runs once per
  // column set: on the first successful render of actual rows, using
  // whichever page happened to load. After that, sizes only change via
  // explicit user resize (columnSizing state), never by re-measuring.
  React.useLayoutEffect(() => {
    if (measuredOnceRef.current || isLoading || rows.length === 0) return;
    const container = gridContainerRef.current;
    if (!container) return;
    measuredOnceRef.current = true;

    const next: Record<string, number> = {};
    // td is a block-level box pinned to the column's *current* fixed width —
    // a plain child fills that box and reports the box's own size back via
    // scrollWidth, never a smaller one, so it can't reveal that a column has
    // more room than it needs. Each [data-measure-column] span is
    // inline-block instead (shrink-to-fit), so its scrollWidth is its actual
    // natural content width — even when that's smaller *or* larger than the
    // column's current size.
    container.querySelectorAll<HTMLElement>('tbody [data-measure-column]').forEach((el) => {
      const id = el.dataset.measureColumn;
      if (!id) return;
      // td padding (px-3 = 0.75rem each side) isn't part of the span itself.
      const width = Math.ceil(el.scrollWidth) + 24;
      next[id] = Math.max(next[id] ?? 0, width);
    });

    setMeasuredSizes((prev) => raiseSizes(prev, next));
  }, [rows, isLoading]);

  return (
    // flex-1/min-h-0 (when fillHeight) let the grid fill a height-locked
    // page and scroll its own rows (sticky header) — see the fillHeight doc
    // for why this is an explicit prop rather than something callers are
    // expected to neutralize from outside.
    <div ref={rootRef} className={cn('flex flex-col gap-3', fillHeight && 'min-h-0 flex-1')}>
      {/* Toolbar: search + primary action on their own row, filters wrap freely on the next */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!hideSearch ? (
            <div className="relative w-80">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
              />
            </div>
          ) : null}
        </div>
        {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
      </div>
      {(filters ?? []).filter((filter) => !filter.inHeader).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {(filters ?? [])
            .filter((filter) => !filter.inHeader)
            .map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;
            const selected = (column.getFilterValue() as string[]) ?? [];
            const onChange = (values: string[]) =>
              column.setFilterValue(values.length ? values : undefined);
            if (filter.render) {
              return (
                <React.Fragment key={filter.columnId}>
                  {filter.render({ selected, onChange })}
                </React.Fragment>
              );
            }
            return (
              <DataGridFacetedFilter
                key={filter.columnId}
                title={filter.title}
                options={filter.options ?? []}
                selected={selected}
                single={filter.single}
                onChange={onChange}
              />
            );
          })}
        </div>
      ) : null}
      {/* Summary row of every currently-active filter (header or toolbar) plus
          the global search term, each independently clearable — separate from
          the filter *pickers* above, which only cover non-inHeader filters. */}
      {isFiltered ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Filters applied:</span>
          {(filters ?? []).flatMap((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return [];
            const selected = (column.getFilterValue() as string[]) ?? [];
            if (selected.length === 0) return [];
            const removeValue = (value: string) => {
              const next = selected.filter((v) => v !== value);
              column.setFilterValue(next.length ? next : undefined);
            };
            return selected.map((value) => {
              const option = filter.options?.find((o) => o.value === value);
              const label = filter.labelFor ? filter.labelFor(value) : (option?.label ?? value);
              return (
                <Badge
                  key={`${filter.columnId}-${value}`}
                  variant={option?.variant ?? 'secondary'}
                  className="gap-1 rounded-md py-1 pr-1 font-normal"
                >
                  <span className="text-muted-foreground">{filter.title}:</span>
                  {filter.chipContent ? filter.chipContent(value) : label}
                  <button
                    type="button"
                    aria-label={`Remove ${filter.title} filter: ${label}`}
                    onClick={() => removeValue(value)}
                    className="rounded-full opacity-70 outline-none hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              );
            });
          })}
          {globalFilter ? (
            <Badge variant="secondary" className="gap-1 rounded-md pr-1 font-normal">
              <span className="text-muted-foreground">Search:</span>
              {globalFilter}
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setGlobalFilter('')}
                className="rounded-full opacity-70 outline-none hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-sm px-1 text-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
          >
            <X className="size-4" />
            Clear all
          </button>
        </div>
      ) : null}
      {/* Grid */}
      <OptionalContextMenu
        content={selectionContextMenu}
        open={contextMenuOpen}
        // isRowDragging blocks the trigger itself (some trackpads fire a
        // native `contextmenu` mid-drag — e.g. a resting second finger read
        // as a two-finger "secondary click"); the dragStateRef check below
        // is a backstop for the brief window right after mousedown, before
        // isRowDragging flips true.
        disabled={isRowDragging}
        // Reads the ref, not `selectedRowModel` — a right-click on a
        // not-yet-selected row selects it (handleRowContextMenu) in the same
        // native event that fires this, and `selectedRowModel` won't reflect
        // that until next render. The ref is updated synchronously instead.
        onOpenChange={(open) =>
          setContextMenuOpen(
            open && Object.keys(rowSelectionRef.current).length > 0 && !dragStateRef.current,
          )
        }
      >
      <div
        ref={gridContainerRef}
        className={cn('overflow-hidden rounded-xl border border-border bg-card', fillHeight && 'min-h-0 flex-1')}
      >
        {/* Vertical gridlines + tight rows for the spreadsheet look.
            table-fixed: widths come from the header row (header.getSize(),
            resizable), never from cell content, so columns don't shift as
            pages/filters change the data. The table's own width tracks the
            sum of column widths rather than staying fixed at 100%, so
            growing a column via resize expands the table — and scrolls —
            instead of squeezing its neighbors; minWidth keeps it filling the
            container the rest of the time, when that sum is narrower (columns
            are now measured to fit their content, not padded out to 200px). */}
        <Table
          style={{ width: table.getTotalSize(), minWidth: '100%' }}
          className="table-fixed [&_td]:border-r [&_th]:border-r [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0 [&_td]:py-1.5"
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const canResize = header.column.getCanResize();
                  const headerFilter = headerFilterByColumnId.get(header.column.id);
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn('relative', columnAlignClass(header.column.columnDef.meta))}
                    >
                      <span className="inline-flex max-w-full items-center gap-1">
                        <span
                          data-measure-column={header.column.id}
                          className="inline-block max-w-full"
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              // uppercase: Preflight sets text-transform:none on
                              // buttons, cancelling the th's uppercase style.
                              className="inline-flex items-center gap-1 rounded-sm uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === 'asc' ? (
                                <ArrowUp className="size-3" />
                              ) : sorted === 'desc' ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ChevronsUpDown className="size-3 opacity-50" />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </span>
                        {headerFilter ? (
                          <span data-no-row-drag>
                            {(() => {
                              const selected =
                                (header.column.getFilterValue() as string[]) ?? [];
                              const onChange = (values: string[]) =>
                                header.column.setFilterValue(
                                  values.length ? values : undefined,
                                );
                              return headerFilter.render ? (
                                headerFilter.render({ selected, onChange })
                              ) : (
                                <DataGridFacetedFilter
                                  title={headerFilter.title}
                                  options={headerFilter.options ?? []}
                                  selected={selected}
                                  single={headerFilter.single}
                                  onChange={onChange}
                                  compact
                                />
                              );
                            })()}
                          </span>
                        ) : null}
                      </span>
                      {canResize ? (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            'absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize touch-none select-none',
                            'after:absolute after:top-0 after:right-1/2 after:h-full after:w-px after:translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-ring',
                            header.column.getIsResizing() && 'after:bg-ring',
                          )}
                        />
                      ) : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={cn(isRowDragging && 'select-none')}>
            {isLoading ? (
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {table.getAllLeafColumns().map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton className="h-4 w-full max-w-[8rem] rounded-md" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length > 0 ? (
              <>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-row-id={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    // Capture, not bubble — a popup's own "click outside
                    // closes it" logic commonly runs in the capture phase
                    // too, and can strip its [data-open] marker before a
                    // bubble-phase handler here would even see it. Running
                    // in capture as well means this always checks that
                    // marker while it's still accurate.
                    onMouseDownCapture={
                      enableRowRangeSelect ? (e) => handleRowMouseDown(e, row) : undefined
                    }
                    onMouseEnter={enableRowRangeSelect ? () => handleRowMouseEnter(row) : undefined}
                    onContextMenu={
                      selectionContextMenu ? () => handleRowContextMenu(row) : undefined
                    }
                    onClick={
                      onRowClick
                        ? () => {
                            if (suppressNextClickRef.current) {
                              suppressNextClickRef.current = false;
                              return;
                            }
                            onRowClick(row.original);
                          }
                        : undefined
                    }
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={columnAlignClass(cell.column.columnDef.meta)}
                      >
                        <span
                          data-measure-column={cell.column.id}
                          className="inline-block max-w-full"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {server?.infiniteScroll && server.page < server.pageCount ? (
                  <TableRow ref={loadMoreRef}>
                    <TableCell
                      colSpan={totalColumns}
                      className="py-3 text-center text-xs text-muted-foreground"
                    >
                      {server.isFetchingNextPage ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="size-3 animate-spin" aria-hidden />
                          Loading more…
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ) : null}
                {/* End-of-list marker on the final page. As the new last child
                    it also restores the bottom border of the last data row
                    (the primitive strips it from :last-child). */}
                {!server || server.page >= server.pageCount ? (
                  <TableRow>
                    <TableCell
                      colSpan={totalColumns}
                      className="py-3 text-center text-xs text-muted-foreground"
                    >
                      -- END OF LIST --
                    </TableCell>
                  </TableRow>
                ) : null}
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={totalColumns}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {!hasData && !isFiltered
                    ? (emptyState ?? 'No records yet.')
                    : 'No results match your search.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </OptionalContextMenu>
      {/* Footer: row count, plus page controls in server mode */}
      {server ? (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? 'Loading…'
                : server.total === 0
                  ? '0 rows'
                  : server.infiniteScroll
                    ? `Showing ${rows.length} of ${server.total} ${server.total === 1 ? 'row' : 'rows'}`
                    : `${(server.page - 1) * server.pageSize + 1}–${Math.min(server.page * server.pageSize, server.total)} of ${server.total} ${server.total === 1 ? 'row' : 'rows'}`}
            </p>
            {footerActions}
          </div>
          <div className="flex items-center gap-2">
            {/* A single page never needs a page indicator or Prev/Next —
                showing "Page 1 of 1" with both buttons disabled is just
                noise. Still shows the fetching spinner via the row-count
                text on the left. Infinite scroll never shows Prev/Next —
                the sentinel row drives paging instead. */}
            {!server.infiniteScroll && server.pageCount > 1 ? (
              <>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isFetching && !isLoading ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : null}
                  Page {server.page} of {server.pageCount}
                </p>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={isLoading || isFetching || server.page <= 1}
                  onClick={() => server.onPageChange(server.page - 1)}
                >
                  <ChevronLeft />
                  <span className="sr-only">Previous page</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={isLoading || isFetching || server.page >= server.pageCount}
                  onClick={() => server.onPageChange(server.page + 1)}
                >
                  <ChevronRight />
                  <span className="sr-only">Next page</span>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? 'Loading…'
              : `${rows.length} of ${data.length} ${data.length === 1 ? 'row' : 'rows'}`}
          </p>
          {footerActions}
        </div>
      )}
    </div>
  );
}
