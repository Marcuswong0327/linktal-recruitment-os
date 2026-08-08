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
import { EnumSelect } from '@/components/EnumSelect';
import { SpecializationCombobox } from '@/components/SpecializationPicker';

interface CreateSpecializationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  industries: { value: string; label: string }[];
  onSubmit: (data: { name: string; industryId: string; parentId?: string }) => Promise<void>;
}

/**
 * The extra step "+ Create" needs for a Specialization but not an Industry:
 * `Specialization.industryId` is required and `name` is only unique *within*
 * an industry (see schema.prisma), so a bare name from the multi-select's
 * search box isn't enough to persist a row — this collects the industry (and
 * optionally a parent category, for filing e.g. "Bakery" under "Food") before
 * the create actually fires.
 */
export function CreateSpecializationDialog({
  open,
  onOpenChange,
  initialName,
  industries,
  onSubmit,
}: CreateSpecializationDialogProps) {
  const [name, setName] = React.useState(initialName);
  const [industryId, setIndustryId] = React.useState('');
  const [parentId, setParentId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setIndustryId('');
      setParentId('');
    }
  }, [open, initialName]);

  // Switching industry invalidates whatever parent was picked under the old one.
  React.useEffect(() => {
    setParentId('');
  }, [industryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !industryId) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: trimmed, industryId, parentId: parentId || undefined });
      onOpenChange(false);
    } catch {
      // Caller's own mutation already surfaces the error (toast) — keep the
      // dialog open, still holding the in-flight "create" promise, so the
      // user can fix the industry/name and retry.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New specialization</DialogTitle>
            <DialogDescription>
              Specializations belong to one industry — pick which one this falls under.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="create-spec-name">Name</Label>
              <Input
                id="create-spec-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="create-spec-industry">Industry</Label>
              <EnumSelect
                id="create-spec-industry"
                value={industryId}
                onValueChange={setIndustryId}
                options={industries}
                placeholder="Select an industry…"
                disabled={submitting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="create-spec-parent">Parent category (optional)</Label>
              <SpecializationCombobox
                id="create-spec-parent"
                value={parentId}
                onValueChange={setParentId}
                industryId={industryId || undefined}
                placeholder={industryId ? 'None — top-level category' : 'Pick an industry first'}
                disabled={submitting || !industryId}
                clearable
              />
            </div>
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
            <Button type="submit" disabled={submitting || !name.trim() || !industryId}>
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
