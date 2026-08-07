'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialValue: string;
  /** Persists the new name. Left open (with the error surfaced by the caller's own toast) if this throws. */
  onSubmit: (value: string) => Promise<void>;
}

/**
 * A single-field "rename this" dialog — the generic shell behind every
 * inline catalog-entry rename (Industry/Specialization tags today; anything
 * else that just needs a name-only edit can reuse it instead of another
 * bespoke form).
 */
export function RenameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  onSubmit,
}: RenameDialogProps) {
  const [value, setValue] = React.useState(initialValue);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset to the current name each time the dialog opens for a (possibly
  // different) tag, rather than carrying over whatever was last typed.
  React.useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch {
      // Caller's own mutation already surfaces the error (toast) — keep the
      // dialog open so the user can retry without retyping.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rename-dialog-value" className="sr-only">
              Name
            </Label>
            <Input
              id="rename-dialog-value"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !value.trim()}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
