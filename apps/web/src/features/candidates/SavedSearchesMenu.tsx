'use client';

import * as React from 'react';
import { Bookmark, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getGetCandidateSavedSearchesQueryKey,
  useCreateCandidateSavedSearch,
  useDeleteCandidateSavedSearch,
  useGetCandidateSavedSearches,
} from '@/lib/api/generated/candidates/candidates';
import type { CandidateFilterState } from './useCandidateSearch';

interface SavedSearchesMenuProps {
  currentFilters: CandidateFilterState;
  hasActiveQuery: boolean;
  onApply: (filters: Partial<CandidateFilterState>) => void;
}

/** Lists, saves and deletes the caller's own candidate searches (personal, not shared). */
export function SavedSearchesMenu({ currentFilters, hasActiveQuery, onApply }: SavedSearchesMenuProps) {
  const queryClient = useQueryClient();
  const { data } = useGetCandidateSavedSearches();
  const savedSearches = data?.status === 200 ? data.data : [];

  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetCandidateSavedSearchesQueryKey() });

  const createSavedSearch = useCreateCandidateSavedSearch({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Search saved');
        setNaming(false);
        setName('');
      },
      onError: (err) => toast.error(err.message || 'Failed to save search'),
    },
  });

  const deleteSavedSearch = useDeleteCandidateSavedSearch({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Saved search deleted');
      },
      onError: (err) => toast.error(err.message || 'Failed to delete saved search'),
    },
  });

  function handleSave() {
    if (!name.trim()) return;
    createSavedSearch.mutate({
      data: { name: name.trim(), filters: currentFilters as unknown as Record<string, unknown> },
    });
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && setNaming(false)}>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Bookmark />
        Saved Searches
        <ChevronDown className="opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Saved searches</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {savedSearches.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">No saved searches yet.</p>
        ) : (
          savedSearches.map((saved) => (
            <DropdownMenuItem
              key={saved.id}
              className="justify-between gap-2"
              onClick={() => onApply(saved.filters as Partial<CandidateFilterState>)}
            >
              <span className="truncate">{saved.name}</span>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSavedSearch.mutate({ id: saved.id });
                }}
                aria-label={`Delete ${saved.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        {naming ? (
          <div className="flex items-center gap-2 p-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              placeholder="Name this search…"
              className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <Button type="button" size="sm" disabled={!name.trim() || createSavedSearch.isPending} onClick={handleSave}>
              Save
            </Button>
          </div>
        ) : (
          <DropdownMenuItem
            closeOnClick={false}
            disabled={!hasActiveQuery}
            onClick={() => setNaming(true)}
          >
            Save current search
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
