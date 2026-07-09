'use client';

import { ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface FacetedFilterOption {
  label: string;
  value: string;
}

interface DataGridFacetedFilterProps {
  title: string;
  options: FacetedFilterOption[];
  /** Currently selected values. */
  selected: string[];
  onChange: (values: string[]) => void;
}

export function DataGridFacetedFilter({
  title,
  options,
  selected,
  onChange,
}: DataGridFacetedFilterProps) {
  const selectedSet = new Set(selected);

  function toggle(value: string, checked: boolean) {
    const next = new Set(selectedSet);
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    onChange([...next]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="default"
            className={cn(
              'rounded-lg border-dashed border-foreground/40 aria-expanded:border-solid dark:bg-input/50 dark:hover:bg-input/70',
              selectedSet.size > 0 &&
                'border-solid border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/60 dark:bg-input/50 dark:text-primary dark:hover:bg-input/70',
            )}
          />
        }
      >
        {title}
        {selectedSet.size > 0 ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-primary/20" />
            {selectedSet.size <= 2 ? (
              options
                .filter((option) => selectedSet.has(option.value))
                .map((option) => (
                  <Badge
                    key={option.value}
                    variant="default"
                    className="rounded-sm px-1 font-normal"
                  >
                    {option.label}
                  </Badge>
                ))
            ) : (
              <Badge variant="default" className="rounded-sm px-1 font-normal">
                {selectedSet.size} selected
              </Badge>
            )}
          </>
        ) : null}
        <ChevronsUpDown className="opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selectedSet.has(option.value)}
              onCheckedChange={(checked) => toggle(option.value, checked)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {selectedSet.size > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn('justify-center text-muted-foreground')}
              onClick={() => onChange([])}
            >
              Clear
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
