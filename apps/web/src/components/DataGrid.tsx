'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataGridFacetedFilter, type FacetedFilterOption } from '@/components/DataGridFacetedFilter';

const SELECT_COLUMN_ID = '__select';

export interface DataGridFilter {
  /** Column id (accessorKey) to filter on. */
  columnId: string;
  /** Label on the filter button. */
  title: string;
  options: FacetedFilterOption[];
  /** Single-select instead of multi (e.g. when the API takes one value). */
  single?: boolean;
}

/** Per-column presentation hints, set via `meta` on a ColumnDef. */
export interface DataGridColumnMeta {
  /** Align header and cells; use center for narrow numeric/pill columns. */
  align?: 'left' | 'center' | 'right';
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
  !Array.isArray(filterValue) || filterValue.length === 0 ? true : filterValue.includes(row.getValue(columnId));

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
  skeletonRows = 8,
  server,
  getRowId,
  onSelectionChange,
  canSelectRow,
}: DataGridProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

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

  // Attach the faceted filter fn to whichever columns are declared filterable.
  const filterColumnIds = React.useMemo(() => new Set((filters ?? []).map((f) => f.columnId)), [filters]);
  const tableColumns = React.useMemo(() => {
    const withFilters = columns.map((col) => {
      const id = (col as { id?: string; accessorKey?: string }).id ?? (col as { accessorKey?: string }).accessorKey;
      return id && filterColumnIds.has(id) ? { ...col, filterFn: facetedFilterFn as FilterFn<TData> } : col;
    });
    if (!onSelectionChange) return withFilters;

    const selectColumn: ColumnDef<TData, unknown> = {
      id: SELECT_COLUMN_ID,
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(!!checked)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          onClick={(e) => e.stopPropagation()}
          disabled={!row.getCanSelect()}
          aria-label="Select row"
        />
      ),
    };
    return [selectColumn, ...withFilters];
  }, [columns, filterColumnIds, onSelectionChange]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, globalFilter, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getRowId: getRowId as ((row: TData) => string) | undefined,
    enableRowSelection: !onSelectionChange ? false : canSelectRow ? (row) => canSelectRow(row.original) : true,
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

  return (
    // flex-1/min-h-0 let the grid fill a height-locked page and scroll its
    // own rows (which also makes the sticky header work); in an unconstrained
    // parent they're inert and the grid sizes to its content as before.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8"
            />
          </div>
          {(filters ?? []).map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;
            const selected = (column.getFilterValue() as string[]) ?? [];
            return (
              <DataGridFacetedFilter
                key={filter.columnId}
                title={filter.title}
                options={filter.options}
                selected={selected}
                single={filter.single}
                onChange={(values) => column.setFilterValue(values.length ? values : undefined)}
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
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        {/* Vertical gridlines + tight rows for the spreadsheet look.
            table-fixed: widths come from the header row (columnDef.size or an
            equal share), never from cell content, so columns don't shift as
            pages/filters change the data. */}
        <Table className="table-fixed [&_td]:border-r [&_th]:border-r [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0 [&_td]:py-1.5">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  // Only apply an explicit width when the column declares one;
                  // undeclared columns share the remaining space equally.
                  const declaredSize = header.column.columnDef.size;
                  return (
                    <TableHead
                      key={header.id}
                      style={declaredSize !== undefined ? { width: declaredSize } : undefined}
                      className={columnAlignClass(header.column.columnDef.meta)}
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
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
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
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={columnAlignClass(cell.column.columnDef.meta)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {/* End-of-list marker on the final page. As the new last child
                    it also restores the bottom border of the last data row
                    (the primitive strips it from :last-child). */}
                {!server || server.page >= server.pageCount ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={totalColumns} className="py-3 text-center text-xs text-muted-foreground">
                      -- END OF LIST --
                    </TableCell>
                  </TableRow>
                ) : null}
              </>
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={totalColumns} className="h-32 text-center text-sm text-muted-foreground">
                  {!hasData && !isFiltered ? (emptyState ?? 'No records yet.') : 'No results match your search.'}
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
            <p className="text-xs text-muted-foreground">
              Page {server.page} of {Math.max(server.pageCount, 1)}
            </p>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={isLoading || server.page <= 1}
              onClick={() => server.onPageChange(server.page - 1)}
            >
              <ChevronLeft />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={isLoading || server.page >= server.pageCount}
              onClick={() => server.onPageChange(server.page + 1)}
            >
              <ChevronRight />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          {isLoading ? 'Loading…' : `${rows.length} of ${data.length} ${data.length === 1 ? 'row' : 'rows'}`}
        </p>
      )}
    </div>
  );
}
