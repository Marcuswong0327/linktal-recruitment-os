'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function NotificationsToggle({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" className={cn(className)}>
                  <Bell />
                  <span className="sr-only">Notifications</span>
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom" align="center">
          Notifications
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-4">
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <Bell className="size-5 text-primary" />
          <p className="text-sm font-medium">Coming soon</p>
          <p className="text-xs text-muted-foreground">Notifications aren&apos;t available yet.</p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
