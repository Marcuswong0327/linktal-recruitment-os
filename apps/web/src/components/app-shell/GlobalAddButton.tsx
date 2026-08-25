'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { hasPermission } from '@/config/nav';
import { actionCommands } from '@/config/commands';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Single global "Add" button that lives in the header, beside the search
 * bar — replaces the old page-aware Add button (which only appeared on a
 * handful of list pages and changed label per page). Lists every creatable
 * entity from `actionCommands` (the same list the command palette's
 * "Actions" group uses) so creating something never requires first
 * navigating to its page. Renders nothing if the user can't create anything.
 */
export function GlobalAddButton({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const auth = { permissions };
  const actions = actionCommands.filter((action) => hasPermission(auth, action.requiredPermission));
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm">
            <Plus />
            Add anything
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action.href} onClick={() => router.push(action.href)}>
            <action.icon />
            {action.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
