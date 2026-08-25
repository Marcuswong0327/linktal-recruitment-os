'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

interface InlineAddRowProps {
  /** Must match the number of columns in the table this row sits in. */
  colSpan: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerDisabled?: boolean;
  triggerLabel: string;
  isSaving: boolean;
  onSave: () => void;
  canSave?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  children: React.ReactNode;
}

/**
 * A table row that expands in place into a small form instead of opening a
 * Sheet — click "+", fill in fields right there, Save collapses it back and
 * the new row lands above it in the list (Notion-style "new row" add).
 */
export function InlineAddRow({
  colSpan,
  open,
  onOpenChange,
  triggerDisabled,
  triggerLabel,
  isSaving,
  onSave,
  canSave = true,
  saveLabel = 'Save',
  savingLabel = 'Saving…',
  children,
}: InlineAddRowProps) {
  if (!open) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="p-0">
          <button
            type="button"
            disabled={triggerDisabled}
            onClick={() => onOpenChange(true)}
            aria-label={triggerLabel}
            className="flex w-full items-center justify-center py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Plus className="size-4" />
          </button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="p-0 whitespace-normal">
        {/* A plain div, not a <form> — this row can sit inside the page's
            own outer <form>, and nesting <form> inside <form> is invalid
            HTML (React would hydration-error on it). */}
        <div className="flex flex-col gap-4 p-4">
          {children}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={isSaving || !canSave}>
              {isSaving ? savingLabel : saveLabel}
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
