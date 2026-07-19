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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
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
  /** Faceted (multi-select) filters shown in the toolbar. */
  filters?: DataGridFilter[];
  /** Rendered on the right side of the toolbar (filters, "Add" button, etc.). */
  toolbar?: React.ReactNode;
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
}

export function DataGrid<TData>({
  columns,
  data,
  searchPlaceholder = 'Search…',
  filters,
  toolbar,
  onRowClick,
  emptyState,
  isLoading = false,
  isFetching = false,
  skeletonRows = 8,
  server,
  getRowId,
  onSelectionChange,
  canSelectRow,
  enableRowRangeSelect = false,
  hideSelectColumn = false,
}: DataGridProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});

  // ⌘K/Ctrl+K focuses the search box, matching the convention used by
  // GitHub/Linear/Slack/Vercel. Defaults to the Windows/Linux label until
  // mounted (avoids an SSR/client hydration mismatch), then flips to ⌘ on
  // Mac. The listener itself accepts either modifier regardless of detected
  // platform, since a Mac user on an external Windows keyboard still expects
  // Ctrl+K to work.
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent));
  }, []);
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Selection is page-scoped (see onSelectionChange doc) — drop it when the
  // visible rows change out from under it. Bails out when already empty:
  // `data` isn't guaranteed referentially stable across renders, and
  // unconditionally setting a fresh `{}` would still swap the state
  // reference every time, which re-fires the onSelectionChange effect below,
  // which updates the caller's state, which re-renders this component with
  // (possibly) another new `data` reference — an infinite loop.
  React.useEffect(() => {
    setRowSelection((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [data]);
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
      next[id] = Math.ceil(el.scrollWidth) + 24;
    });
    setMeasuredSizes((prev) => raiseSizes(prev, next));
    setHeaderOnlySizes((prev) => raiseSizes(prev, next));
  }, [columns]);

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
  const suppressNextClickRef = React.useRef(false);
  const [isRowDragging, setIsRowDragging] = React.useState(false);

  const rowIndexById = React.useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.id, i));
    return map;
  }, [rows]);

  const handleRowMouseDown = React.useCallback(
    (e: React.MouseEvent, row: Row<TData>) => {
      if (!enableRowRangeSelect || e.button !== 0) return;
      // Let interactive cells (pills, comboboxes, the row's own link) handle
      // their own mousedown — starting a drag from inside one would fight
      // its click/open behavior.
      if ((e.target as HTMLElement).closest('[data-no-row-drag]')) return;
      e.preventDefault(); // suppress native text selection while dragging
      dragStateRef.current = { anchorId: row.id, moved: false };
    },
    [enableRowRangeSelect],
  );

  const handleRowMouseEnter = React.useCallback(
    (row: Row<TData>) => {
      const state = dragStateRef.current;
      if (!state) return;
      state.moved = true;
      setIsRowDragging(true);
      const anchorIdx = rowIndexById.get(state.anchorId);
      const currentIdx = rowIndexById.get(row.id);
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
      setIsRowDragging(false);
    }
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [enableRowRangeSelect]);

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
    // flex-1/min-h-0 let the grid fill a height-locked page and scroll its
    // own rows (which also makes the sticky header work); in an unconstrained
    // parent they're inert and the grid sizes to its content as before.
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8 pr-12"
            />
            {!globalFilter && (
              <div className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
                <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>K</Kbd>
              </div>
            )}
          </div>
          {(filters ?? []).map((filter) => {
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
          {isFiltered ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-sm px-1 text-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
            >
              <X className="size-4" />
              Clear
            </button>
          ) : null}
        </div>
        {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
      </div>
      {/* Grid */}
      <div
        ref={gridContainerRef}
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card"
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
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const canResize = header.column.getCanResize();
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn('relative', columnAlignClass(header.column.columnDef.meta))}
                    >
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
                <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
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
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onMouseDown={
                      enableRowRangeSelect ? (e) => handleRowMouseDown(e, row) : undefined
                    }
                    onMouseEnter={enableRowRangeSelect ? () => handleRowMouseEnter(row) : undefined}
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
                {/* End-of-list marker on the final page. As the new last child
                    it also restores the bottom border of the last data row
                    (the primitive strips it from :last-child). */}
                {!server || server.page >= server.pageCount ? (
                  <TableRow className="hover:bg-transparent">
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
              <TableRow className="hover:bg-transparent">
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
      {/* Footer: row count, plus page controls in server mode */}
      {server ? (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? 'Loading…'
              : server.total === 0
                ? '0 rows'
                : `${(server.page - 1) * server.pageSize + 1}–${Math.min(server.page * server.pageSize, server.total)} of ${server.total} ${server.total === 1 ? 'row' : 'rows'}`}
          </p>
          <div className="flex items-center gap-2">
            {/* A single page never needs a page indicator or Prev/Next —
                showing "Page 1 of 1" with both buttons disabled is just
                noise. Still shows the fetching spinner via the row-count
                text on the left. */}
            {server.pageCount > 1 ? (
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
        <p className="px-1 text-xs text-muted-foreground">
          {isLoading
            ? 'Loading…'
            : `${rows.length} of ${data.length} ${data.length === 1 ? 'row' : 'rows'}`}
        </p>
      )}
    </div>
  );
}
