'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataGridFacetedFilter, type FacetedFilterOption } from '@/components/DataGridFacetedFilter';

export interface DataGridFilter {
  /** Column id (accessorKey) to filter on. */
  columnId: string;
  /** Label on the filter button. */
  title: string;
  options: FacetedFilterOption[];
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
}: DataGridProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  // Attach the faceted filter fn to whichever columns are declared filterable.
  const filterColumnIds = React.useMemo(() => new Set((filters ?? []).map((f) => f.columnId)), [filters]);
  const tableColumns = React.useMemo(
    () =>
      columns.map((col) => {
        const id = (col as { id?: string; accessorKey?: string }).id ?? (col as { accessorKey?: string }).accessorKey;
        return id && filterColumnIds.has(id) ? { ...col, filterFn: facetedFilterFn as FilterFn<TData> } : col;
      }),
    [columns, filterColumnIds],
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const isFiltered = columnFilters.length > 0 || globalFilter !== '';

  function resetFilters() {
    setColumnFilters([]);
    setGlobalFilter('');
  }

  const rows = table.getRowModel().rows;
  const hasData = data.length > 0;
  const totalColumns = table.getAllLeafColumns().length;

  return (
    <div className="flex flex-col gap-3">
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
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={totalColumns} className="h-32 text-center text-sm text-muted-foreground">
                  {!hasData ? (emptyState ?? 'No records yet.') : 'No results match your search.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* Footer count */}
      <p className="px-1 text-xs text-muted-foreground">
        {isLoading ? 'Loading…' : `${rows.length} of ${data.length} ${data.length === 1 ? 'row' : 'rows'}`}
      </p>
    </div>
  );
}
