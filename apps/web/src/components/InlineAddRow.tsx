'use client';

import * as React from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';

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
  /**
   * 'stacked' (default): children stacked above a full-width Cancel/Save
   * button row — for forms with several fields (e.g. CompanyDetail's own
   * "add a stakeholder" row).
   * 'inline': children and a compact check/✕ icon pair share one row — for
   * a couple of critical fields only, closer to Notion's "type directly
   * into the row" new-row feel instead of a form popping out underneath it.
   */
  layout?: 'stacked' | 'inline';
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
  layout = 'stacked',
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

  // Enter-to-save/Escape-to-cancel — the inline layout has no visible Save
  // button to reach for by default, so typing and pressing Enter needs to be
  // the primary way through it (the check/✕ icons are there for the mouse,
  // not the only way to commit).
  function handleKeyDown(e: React.KeyboardEvent) {
    if (isSaving) return;
    if (e.key === 'Enter' && canSave) {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  }

  if (layout === 'inline') {
    return (
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={colSpan} className="p-0 whitespace-normal">
          {/* A plain div, not a <form> — this row can sit inside the page's
              own outer <form>, and nesting <form> inside <form> is invalid
              HTML (React would hydration-error on it). */}
          <div className="flex items-center gap-2 p-2" onKeyDown={handleKeyDown}>
            <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
                aria-label="Cancel"
              >
                <X />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onSave}
                disabled={isSaving || !canSave}
                aria-label={saveLabel}
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
              </Button>
            </div>
          </div>
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
