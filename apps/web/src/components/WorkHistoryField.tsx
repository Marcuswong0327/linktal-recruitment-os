'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface WorkHistoryItem {
  role?: string;
  company?: string;
  period?: string;
}

interface WorkHistoryFieldProps {
  value: WorkHistoryItem[];
  /** Called with the full committed list on every edit — fully-blank rows are never included. */
  onChange: (items: WorkHistoryItem[]) => void;
  disabled?: boolean;
}

function isEmptyRow(item: WorkHistoryItem) {
  return !item.role && !item.company && !item.period;
}

/** Repeatable Title/Company/Period rows for a candidate's employment history — spreadsheet-style: there's always one blank trailing row to type a new entry into, which commits into `value` (and a fresh blank row takes its place) as soon as it has any content. Mirrors MultiFileUploadField's "always show an affordance to add one more" shape. */
export function WorkHistoryField({ value, onChange, disabled }: WorkHistoryFieldProps) {
  const rows = value.length === 0 || !isEmptyRow(value[value.length - 1]) ? [...value, {}] : value;
  const [pendingRemoveIndex, setPendingRemoveIndex] = React.useState<number | null>(null);

  function updateField(index: number, field: keyof WorkHistoryItem, text: string) {
    const updated = { ...rows[index], [field]: text };
    const next = [...value];
    if (index < value.length) {
      next[index] = updated;
    } else {
      next.push(updated);
    }
    onChange(next.filter((r) => !isEmptyRow(r)));
  }

  function confirmRemoveRow() {
    if (pendingRemoveIndex === null) return;
    onChange(value.filter((_, i) => i !== pendingRemoveIndex));
    setPendingRemoveIndex(null);
  }

  const pendingRow = pendingRemoveIndex !== null ? value[pendingRemoveIndex] : undefined;
  const pendingRowLabel = pendingRow
    ? [pendingRow.role, pendingRow.company].filter(Boolean).join(' at ') || 'this entry'
    : 'this entry';

  return (
    <>
      <div className="max-h-96 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="divide-x divide-border">
              <TableHead className="min-w-48">Title</TableHead>
              <TableHead className="min-w-48">Company</TableHead>
              <TableHead className="min-w-32">Period</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} className="divide-x divide-border">
                <TableCell className="p-1">
                  <Input
                    aria-label="Title"
                    value={row.role ?? ''}
                    onChange={(e) => updateField(i, 'role', e.target.value)}
                    placeholder="e.g. Relationship Manager"
                    disabled={disabled}
                    className="min-w-48 border-transparent bg-transparent shadow-none focus-visible:border-input"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    aria-label="Company"
                    value={row.company ?? ''}
                    onChange={(e) => updateField(i, 'company', e.target.value)}
                    placeholder="e.g. Maybank"
                    disabled={disabled}
                    className="min-w-48 border-transparent bg-transparent shadow-none focus-visible:border-input"
                  />
                </TableCell>
                <TableCell className="p-1">
                  <Input
                    aria-label="Period"
                    value={row.period ?? ''}
                    onChange={(e) => updateField(i, 'period', e.target.value)}
                    placeholder="e.g. 2023-2026"
                    disabled={disabled}
                    className="min-w-32 border-transparent bg-transparent shadow-none focus-visible:border-input"
                  />
                </TableCell>
                <TableCell className="p-1">
                  {i < value.length && !disabled ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove entry"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setPendingRemoveIndex(i)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDeleteDialog
        open={pendingRemoveIndex !== null}
        onOpenChange={(open) => !open && setPendingRemoveIndex(null)}
        title="Remove this employment history entry?"
        description={`This will remove "${pendingRowLabel}" from the candidate's employment history.`}
        onConfirm={confirmRemoveRow}
      />
    </>
  );
}
