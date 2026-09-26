'use client';

import { usePathname } from 'next/navigation';

/**
 * Exact list/workspace routes whose title lives in the shell top bar
 * (same row as Search anything…). Detail routes like `/candidates/[id]`
 * are intentionally omitted — they keep their in-page headers.
 */
const TOP_BAR_TITLES: Record<string, string> = {
  '/job-orders': 'Job Orders',
  '/companies': 'Companies',
  '/stakeholders': 'Stakeholders',
  '/stakeholders/enrich': 'Stakeholder Enrichment Workspace',
  '/job-opening-search': 'Job Opening Search',
  '/candidates': 'Candidates',
};

export function AppTopBarTitle() {
  const pathname = usePathname();
  const title = TOP_BAR_TITLES[pathname];
  if (!title) return null;

  return (
    <h1 className="min-w-0 flex-1 truncate font-heading text-lg font-semibold tracking-tight">
      {title}
    </h1>
  );
}
