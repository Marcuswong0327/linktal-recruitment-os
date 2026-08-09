import * as React from 'react';

/**
 * Accumulates rows for DataGrid's `server.infiniteScroll` mode out of a plain
 * paged query hook (`page`/`pageSize`, one page per request) rather than
 * `useInfiniteQuery` — every table here already fetches this way, so this
 * just re-slots each page's result instead of rewiring data-fetching.
 *
 * Each page gets its own slot. Settling page 1 always resets every later
 * slot: that only ever happens because the caller reset `page` to 1 after a
 * search/sort/filter change (everything after is now for the wrong query) or
 * because page 1 is still the only one loaded (resetting to itself is a
 * no-op). Settling any later page can only be the single currently-mounted
 * query re-resolving — either reaching that page for the first time by
 * scrolling, or that same page refetching after a mutation — so it
 * overwrites its own slot in place rather than appending a duplicate.
 *
 * Waits for `isFetching` to clear before committing: react-query's
 * `keepPreviousData` hands back the *previous* query's rows as a placeholder
 * while the next page is in flight, which would otherwise land in the wrong
 * slot.
 */
export function useInfinitePages<T>(pageRows: T[] | undefined, page: number, isFetching: boolean): T[] {
  const slotsRef = React.useRef<T[][]>([]);
  const [rows, setRows] = React.useState<T[]>([]);

  React.useEffect(() => {
    if (isFetching || !pageRows) return;
    const slots = page === 1 ? [] : slotsRef.current.slice(0, page - 1);
    slots[page - 1] = pageRows;
    slotsRef.current = slots;
    setRows(slots.flat());
  }, [pageRows, page, isFetching]);

  return rows;
}
