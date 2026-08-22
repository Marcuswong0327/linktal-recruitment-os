'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { hasPermission, type RequiredPermission } from '@/config/nav';
import { Button } from '@/components/ui/button';

interface PageCreateAction {
  /** Exact pathname this action shows on — not a prefix, so it doesn't also show on a detail page (`/companies/[id]`) or the entity's own create page. */
  pathname: string;
  label: string;
  requiredPermission: RequiredPermission;
  /**
   * 'sheet': navigates to this same page with `?new=1` — its own table
   * already listens for that (opened via the command palette's action
   * commands originally) and opens its create Sheet.
   * 'link': navigates straight to a dedicated create page.
   */
  mode: 'sheet' | 'link';
  /** Required when `mode` is 'link'. */
  href?: string;
}

const PAGE_CREATE_ACTIONS: PageCreateAction[] = [
  { pathname: '/companies', label: 'Add Company', requiredPermission: { resource: 'client', action: 'create' }, mode: 'sheet' },
  {
    pathname: '/candidates',
    label: 'Add Candidate',
    requiredPermission: { resource: 'candidate', action: 'create' },
    mode: 'sheet',
  },
  {
    pathname: '/job-orders',
    label: 'Add Job Order',
    requiredPermission: { resource: 'job_order', action: 'create' },
    mode: 'link',
    href: '/job-orders/new',
  },
  {
    pathname: '/job-orders-search',
    label: 'Add Job Orders Research',
    requiredPermission: { resource: 'job_research', action: 'create' },
    mode: 'sheet',
  },
];

/**
 * Page-aware "Add X" button that lives in the global header, beside the
 * search bar — so creating whatever the current page is about doesn't
 * require scrolling down to that page's own footer. Renders nothing on a
 * page with no create action (or none the caller has permission for).
 */
export function AddEntityButton({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const action = PAGE_CREATE_ACTIONS.find((a) => a.pathname === pathname);
  if (!action || !hasPermission({ permissions }, action.requiredPermission)) return null;

  if (action.mode === 'link') {
    return (
      <Button size="sm" nativeButton={false} render={<Link href={action.href!} />}>
        <Plus />
        {action.label}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => router.push(`${pathname}?new=1`)}>
      <Plus />
      {action.label}
    </Button>
  );
}
